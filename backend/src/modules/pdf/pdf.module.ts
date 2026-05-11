import { Module } from '@nestjs/common';
import { PDFController } from './pdf.controller';
import { PDFService } from './pdf.service';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [CompanyModule],
  controllers: [PDFController],
  providers: [PDFService],
  exports: [PDFService],
})
export class PDFModule {}
