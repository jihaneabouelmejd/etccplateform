import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private config: ConfigService) {}

  private getOAuth2Client() {
    // Dynamic import to avoid crash if googleapis not installed
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { google } = require('googleapis');
      return new google.auth.OAuth2(
        this.config.get('GOOGLE_CLIENT_ID'),
        this.config.get('GOOGLE_CLIENT_SECRET'),
        this.config.get('GOOGLE_REDIRECT_URI') || `${this.config.get('BACKEND_URL') || 'http://localhost:4000'}/agenda/google/callback`,
      );
    } catch {
      return null;
    }
  }

  isConfigured(): boolean {
    return !!(this.config.get('GOOGLE_CLIENT_ID') && this.config.get('GOOGLE_CLIENT_SECRET'));
  }

  generateAuthUrl(): string | null {
    if (!this.isConfigured()) return null;
    const oauth2Client = this.getOAuth2Client();
    if (!oauth2Client) return null;

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
    });
  }

  async exchangeCode(code: string): Promise<any> {
    const oauth2Client = this.getOAuth2Client();
    if (!oauth2Client) throw new Error('Google API non configuré');
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  async syncTaskToCalendar(tokens: any, task: {
    id: string;
    title: string;
    description?: string;
    due_date: Date;
    start_time?: string | null;
    end_time?: string | null;
    project?: { name: string; code: string } | null;
    google_event_id?: string | null;
  }): Promise<string | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { google } = require('googleapis');
      const oauth2Client = this.getOAuth2Client();
      if (!oauth2Client) return null;

      oauth2Client.setCredentials(tokens);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const dueDate = new Date(task.due_date);
      const dateStr = dueDate.toISOString().split('T')[0];

      // Use dateTime (with hours) if start_time is provided, otherwise all-day event
      let startEntry: any;
      let endEntry: any;
      if (task.start_time) {
        const endTime = task.end_time || task.start_time;
        startEntry = { dateTime: `${dateStr}T${task.start_time}:00`, timeZone: 'Africa/Casablanca' };
        endEntry   = { dateTime: `${dateStr}T${endTime}:00`, timeZone: 'Africa/Casablanca' };
      } else {
        const nextDay = new Date(dueDate);
        nextDay.setDate(nextDay.getDate() + 1);
        startEntry = { date: dateStr };
        endEntry   = { date: nextDay.toISOString().split('T')[0] };
      }

      const event = {
        summary: `${task.project?.code ? `[${task.project.code}] ` : ''}${task.title}`,
        description: task.description || (task.project ? `Chantier: ${task.project.name}` : ''),
        start: startEntry,
        end: endEntry,
        source: {
          title: 'ETCC Platform',
          url: `${this.config.get('FRONTEND_URL') || 'http://localhost:3000'}/taches`,
        },
        colorId: task.project ? '2' : '1', // sage green for project tasks
      };

      if (task.google_event_id) {
        // Update existing
        const res = await calendar.events.update({
          calendarId: 'primary',
          eventId: task.google_event_id,
          requestBody: event,
        });
        return res.data.id;
      } else {
        // Create new
        const res = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: event,
        });
        return res.data.id;
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || String(err);
      this.logger.warn(`Failed to sync task ${task.id}: ${msg}`);
      throw new Error(msg);
    }
  }

  async deleteCalendarEvent(tokens: any, eventId: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { google } = require('googleapis');
      const oauth2Client = this.getOAuth2Client();
      if (!oauth2Client) return;

      oauth2Client.setCredentials(tokens);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      await calendar.events.delete({ calendarId: 'primary', eventId });
    } catch (err) {
      this.logger.warn(`Failed to delete event ${eventId}: ${err.message}`);
    }
  }
}
