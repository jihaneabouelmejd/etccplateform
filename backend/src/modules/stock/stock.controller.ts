import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { StockService } from './stock.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('stock')
@Controller('stock')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StockController {
  constructor(private readonly stock: StockService) {}

  // Products
  @Post('products')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  create(@Body() data: any) { return this.stock.createProduct(data); }

  @Get('products')
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('low_stock') lowStock?: string,
    @Query('page') page?: number,
  ) {
    return this.stock.findAllProducts({
      search, category, low_stock: lowStock === 'true', page,
    });
  }

  @Get('products/categories')
  getCategories() { return this.stock.getCategories(); }

  @Get('products/stats')
  getStats() { return this.stock.getStats(); }

  @Get('products/:id')
  findOne(@Param('id') id: string) { return this.stock.findOneProduct(id); }

  @Patch('products/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  update(@Param('id') id: string, @Body() data: any) { return this.stock.updateProduct(id, data); }

  @Delete('products/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  remove(@Param('id') id: string) { return this.stock.removeProduct(id); }

  // Mouvements
  @Post('entry')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  addEntry(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.stock.addStockEntry(data, userId);
  }

  @Post('adjust')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  adjust(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.stock.adjustStock(data, userId);
  }

  @Get('movements')
  findMovements(
    @Query('product_id') productId?: string,
    @Query('type') type?: string,
    @Query('project_id') projectId?: string,
    @Query('page') page?: number,
  ) {
    return this.stock.findAllMovements({ product_id: productId, type, project_id: projectId, page });
  }

  // Demandes
  @Post('requests')
  createRequest(@Body() data: any, @CurrentUser('id') userId: string) {
    return this.stock.createMaterialRequest(data, userId);
  }

  @Get('requests')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  findRequests(@Query('status') status?: string) {
    return this.stock.findAllRequests(status);
  }

  @Patch('requests/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  approveRequest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.stock.approveRequest(id, userId);
  }

  @Patch('requests/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.GERANT)
  rejectRequest(@Param('id') id: string) {
    return this.stock.rejectRequest(id);
  }
}
