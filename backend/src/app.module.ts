import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompanyModule } from './modules/company/company.module';
import { ClientsModule } from './modules/clients/clients.module';
import { FournisseursModule } from './modules/fournisseurs/fournisseurs.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { DevisModule } from './modules/devis/devis.module';
import { BCModule } from './modules/bc/bc.module';
import { BLModule } from './modules/bl/bl.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { SignaturesModule } from './modules/signatures/signatures.module';
import { PDFModule } from './modules/pdf/pdf.module';
import { StockModule } from './modules/stock/stock.module';
import { DepensesModule } from './modules/depenses/depenses.module';
import { DettesModule } from './modules/dettes/dettes.module';
import { RapprochementModule } from './modules/rapprochement/rapprochement.module';
import { AlertesModule } from './modules/alertes/alertes.module';
import { UploadModule } from './modules/upload/upload.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { PrestationsModule } from './modules/prestations/prestations.module';
import { MailModule } from './modules/mail/mail.module';
import { MarchesPrivesModule } from './modules/marches-prives/marches-prives.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // ✅ ThrottlerModule supprimé temporairement
    PrismaModule,
    AuthModule,
    UsersModule,
    CompanyModule,
    SignaturesModule,
    ClientsModule,
    FournisseursModule,
    ProjectsModule,
    TasksModule,
    DevisModule,
    BCModule,
    BLModule,
    InvoicesModule,
    StockModule,
    DepensesModule,
    DettesModule,
    RapprochementModule,
    AlertesModule,
    PDFModule,
    UploadModule,
    AgendaModule,
    PrestationsModule,
    MailModule,
    MarchesPrivesModule,
  ],
})
export class AppModule {}
