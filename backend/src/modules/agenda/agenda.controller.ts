import {
  Body, Controller, Delete, Get, Param, Patch, Post,
  Query, Redirect, UseGuards, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AgendaService } from './agenda.service';
import { GoogleCalendarService } from './google-calendar.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('agenda')
@Controller('agenda')
export class AgendaController {
  constructor(
    private readonly agendaService: AgendaService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly config: ConfigService,
  ) {}

  // ─── AGENDA DATA (calendar view) ──────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getAgendaData(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query('month') month = String(new Date().getMonth() + 1),
    @Query('year') year = String(new Date().getFullYear()),
  ) {
    return this.agendaService.getAgendaData(userId, role, parseInt(month), parseInt(year));
  }

  // ─── OBJECTIFS ────────────────────────────────────────────────────────────

  @Post('objectifs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  createObjectif(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.agendaService.createObjectif(data, userId);
  }

  @Get('objectifs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getObjectifs(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query('project_id') projectId?: string,
    @Query('completed') completed?: string,
  ) {
    const isAdmin = ['ADMIN', 'GERANT'].includes(role);
    return this.agendaService.findObjectifs({
      user_id: isAdmin ? undefined : userId,
      project_id: projectId,
      completed: completed !== undefined ? completed === 'true' : undefined,
    });
  }

  @Patch('objectifs/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateObjectif(
    @Param('id') id: string,
    @Body() data: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.agendaService.updateObjectif(id, data, userId);
  }

  @Delete('objectifs/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  deleteObjectif(@Param('id') id: string) {
    return this.agendaService.deleteObjectif(id);
  }

  // ─── GOOGLE CALENDAR OAuth2 ───────────────────────────────────────────────

  @Get('google/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async googleStatus(@CurrentUser('id') userId: string) {
    const token = await this.agendaService.getGoogleToken(userId);
    return {
      connected: !!token,
      configured: this.googleCalendar.isConfigured(),
    };
  }

  @Get('google/auth-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getGoogleAuthUrl() {
    const url = this.googleCalendar.generateAuthUrl();
    return { url, configured: this.googleCalendar.isConfigured() };
  }

  /** Google redirects here with ?code=... (no JWT — public endpoint) */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string, // userId encoded as state
    @Res() res: Response,
  ) {
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    try {
      if (!code || !state) {
        return res.redirect(`${frontendUrl}/agenda?google=error`);
      }

      const tokens = await this.googleCalendar.exchangeCode(code);
      await this.agendaService.saveGoogleToken(state, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        scope: tokens.scope,
      });

      return res.redirect(`${frontendUrl}/agenda?google=connected`);
    } catch {
      return res.redirect(`${frontendUrl}/agenda?google=error`);
    }
  }

  @Get('google/auth-url-with-state')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getGoogleAuthUrlWithState(@CurrentUser('id') userId: string) {
    if (!this.googleCalendar.isConfigured()) {
      return { url: null, configured: false };
    }

    // Rebuild URL with state=userId so the callback knows who's connecting
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { google } = require('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        this.config.get('GOOGLE_CLIENT_ID'),
        this.config.get('GOOGLE_CLIENT_SECRET'),
        this.config.get('GOOGLE_REDIRECT_URI') || `${this.config.get('BACKEND_URL') || 'http://localhost:4000'}/agenda/google/callback`,
      );
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/calendar.events'],
        state: userId,
      });
      return { url, configured: true };
    } catch {
      return { url: null, configured: false };
    }
  }

  @Delete('google/disconnect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async disconnectGoogle(@CurrentUser('id') userId: string) {
    await this.agendaService.deleteGoogleToken(userId);
    return { success: true };
  }

  // ─── SYNC TASKS → GOOGLE CALENDAR ─────────────────────────────────────────

  @Post('google/sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async syncToGoogle(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const tokenRecord = await this.agendaService.getGoogleToken(userId);
    if (!tokenRecord) {
      return { success: false, message: 'Google Agenda non connecté' };
    }

    const tokens = {
      access_token: tokenRecord.access_token,
      refresh_token: tokenRecord.refresh_token,
      expiry_date: tokenRecord.expiry_date ? Number(tokenRecord.expiry_date) : undefined,
    };

    const tasks = await this.agendaService.getTasksForSync(userId, role);
    let synced = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const task of tasks) {
      try {
        const eventId = await this.googleCalendar.syncTaskToCalendar(tokens, {
          id: task.id,
          title: task.title,
          description: task.description || undefined,
          due_date: task.due_date!,
          project: task.project,
          google_event_id: task.google_event_id,
        });

        if (eventId) {
          await this.agendaService.updateTaskGoogleEventId(task.id, eventId);
          synced++;
        } else {
          errors++;
          errorDetails.push(`Task ${task.title}: sync returned null`);
        }
      } catch (err: any) {
        errors++;
        errorDetails.push(`Task ${task.title}: ${err?.message || String(err)}`);
      }
    }

    return { success: true, synced, errors, total: tasks.length, errorDetails };
  }
}
