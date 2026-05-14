import {
  Controller, Get, Post, Body, Param, Query, Res, UseGuards, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PDFService, PDFLanguage } from './pdf.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('pdf')
@Controller('pdf')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PDFController {
  constructor(
    private readonly pdfService: PDFService,
    private readonly prisma: PrismaService,
  ) {}

  // DEVIS PDF
  @Get('devis/:id')
  @ApiOperation({ summary: 'Générer PDF du devis (FR ou AR)' })
  async generateDevisPDF(
    @Param('id') id: string,
    @Query('lang') lang: PDFLanguage = 'FR',
    @Res() res: Response,
  ) {
    const devis = await this.prisma.devis.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { order: 'asc' } },
        client: true,
        creator: { select: { first_name: true, last_name: true } },
        signature: true,
      },
    });
    if (!devis) throw new NotFoundException('Devis non trouvé');
    const pdfBuffer = await this.pdfService.generateDevisPDF({
      number: devis.number,
      issue_date: devis.issue_date.toISOString(),
      validity_days: devis.validity_days,
      expires_at: devis.expires_at?.toISOString() || '',
      object: devis.object || undefined,
      client: {
        commercial_name: devis.client.commercial_name,
        ice: devis.client.ice || undefined,
        rc: devis.client.rc || undefined,
        address: devis.client.address || undefined,
        city: devis.client.city || undefined,
        phone: devis.client.phone || undefined,
        email: devis.client.email || undefined,
      },
      lines: devis.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        total_ht: Number(l.total_ht),
      })),
      total_ht_brut: Number(devis.total_ht_brut),
      discount_rate: Number(devis.discount_rate),
      discount_amount: Number(devis.discount_amount),
      total_ht_net: Number(devis.total_ht_net),
      tva_rate: Number(devis.tva_rate),
      tva_amount: Number(devis.tva_amount),
      total_ttc: Number(devis.total_ttc),
      payment_terms: devis.payment_terms || undefined,
      notes: devis.notes || undefined,
      signature_url: devis.signature?.image_url || undefined,
      creator_name: `${devis.creator.first_name} ${devis.creator.last_name}`,
    }, lang);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${devis.number}-${lang}.pdf"`);
    res.send(pdfBuffer);
  }

  // BC PDF
  @Get('bc/:id')
  @ApiOperation({ summary: 'Générer PDF du bon de commande (FR ou AR)' })
  async generateBCPDF(
    @Param('id') id: string,
    @Query('lang') lang: PDFLanguage = 'FR',
    @Res() res: Response,
  ) {
    const bc = await this.prisma.bonCommande.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { order: 'asc' } },
        client: true,
        devis: { select: { number: true } },
        signature: true,
      },
    });
    if (!bc) throw new NotFoundException('Bon de commande non trouvé');
    const pdfBuffer = await this.pdfService.generateBCPDF({
      number: bc.number,
      issue_date: bc.issue_date.toISOString(),
      expected_delivery: bc.expected_delivery?.toISOString() || undefined,
      status: bc.status,
      source: bc.source,
      devis_number: bc.devis?.number || undefined,
      signature_url: (bc as any).signature?.image_url || undefined,
      client: {
        commercial_name: bc.client.commercial_name,
        ice: bc.client.ice || undefined,
        rc: bc.client.rc || undefined,
        address: bc.client.address || undefined,
        city: bc.client.city || undefined,
        phone: bc.client.phone || undefined,
        email: bc.client.email || undefined,
      },
      lines: (bc.lines as any[]).map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: l.unit_price ? Number(l.unit_price) : undefined,
      })),
      total_ht: bc.total_ht ? Number(bc.total_ht) : undefined,
      total_ttc: bc.total_ttc ? Number(bc.total_ttc) : undefined,
      notes: bc.notes || undefined,
    }, lang);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bc.number}-${lang}.pdf"`);
    res.send(pdfBuffer);
  }

  // BL PDF
  @Get('bl/:id')
  @ApiOperation({ summary: 'Générer PDF du BL (FR ou AR)' })
  async generateBLPDF(
    @Param('id') id: string,
    @Query('lang') lang: PDFLanguage = 'FR',
    @Res() res: Response,
  ) {
    const bl = await this.prisma.bonLivraison.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { order: 'asc' } },
        client: true,
        bc: { include: { devis: { select: { number: true } } } },
        signature: true,
        project: { select: { name: true } },
      },
    });
    if (!bl) throw new NotFoundException('BL non trouvé');
    const pdfBuffer = await this.pdfService.generateBLPDF({
      number: bl.number,
      bc_number: bl.bc?.number || undefined,
      devis_number: bl.bc?.devis?.number || undefined,
      issue_date: bl.issue_date.toISOString(),
      delivery_date: bl.delivery_date?.toISOString() || undefined,
      client: {
        commercial_name: bl.client.commercial_name,
        ice: bl.client.ice || undefined,
        address: bl.client.address || undefined,
        city: bl.client.city || undefined,
      },
      project_name: bl.project?.name || undefined,
      lines: bl.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity) })),
      delivered_by: bl.delivered_by || undefined,
      delivery_address: bl.delivery_address || undefined,
      notes: bl.notes || undefined,
      signature_url: bl.signature?.image_url || undefined,
    }, lang);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bl.number}-${lang}.pdf"`);
    res.send(pdfBuffer);
  }

  // INVOICE PDF
  @Get('invoice/:id')
  @ApiOperation({ summary: 'Générer PDF de la facture (FR ou AR)' })
  async generateInvoicePDF(
    @Param('id') id: string,
    @Query('lang') lang: PDFLanguage = 'FR',
    @Res() res: Response,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { order: 'asc' } },
        client: true,
        fournisseur: true,
        bl: { select: { number: true } },
        bc: { select: { number: true } },
        signature: true,
      },
    });
    if (!invoice) throw new NotFoundException('Facture non trouvée');
    let pdfBuffer: Buffer;
    if (invoice.direction === 'RECEIVED') {
      pdfBuffer = await this.pdfService.generatePurchaseInvoicePDF({
        number: invoice.number,
        issue_date: invoice.issue_date.toISOString(),
        due_date: invoice.due_date?.toISOString() || undefined,
        fournisseur_name: (invoice.fournisseur as any)?.name || 'Fournisseur inconnu',
        total_ht: Number(invoice.total_ht_brut),
        tva_amount: Number(invoice.tva_amount),
        total_ttc: Number(invoice.total_ttc),
        notes: invoice.notes || undefined,
      });
    } else {
      if (!invoice.client) throw new NotFoundException('Client introuvable pour cette facture');
      pdfBuffer = await this.pdfService.generateInvoicePDF({
        number: invoice.number,
        bl_number: invoice.bl?.number || undefined,
        bc_number: invoice.bc?.number || undefined,
        issue_date: invoice.issue_date.toISOString(),
        due_date: invoice.due_date?.toISOString() || undefined,
        client: {
          commercial_name: invoice.client.commercial_name,
          ice: invoice.client.ice || undefined,
          rc: invoice.client.rc || undefined,
          address: invoice.client.address || undefined,
          city: invoice.client.city || undefined,
          phone: invoice.client.phone || undefined,
          email: invoice.client.email || undefined,
        },
        lines: invoice.lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          total_ht: Number(l.total_ht),
        })),
        total_ht_brut: Number(invoice.total_ht_brut),
        discount_rate: Number(invoice.discount_rate),
        discount_amount: Number(invoice.discount_amount),
        total_ht_net: Number(invoice.total_ht_net),
        tva_rate: Number(invoice.tva_rate),
        tva_amount: Number(invoice.tva_amount),
        total_ttc: Number(invoice.total_ttc),
        acompte_amount: Number(invoice.acompte_amount),
        balance: Number(invoice.balance),
        payment_method: invoice.payment_method || undefined,
        payment_terms: invoice.payment_terms || undefined,
        notes: invoice.notes || undefined,
        signature_url: invoice.signature?.image_url || undefined,
      }, lang);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.number}-${lang}.pdf"`);
    res.send(pdfBuffer);
  }

  // MERGE
  @Post('merge')
  @ApiOperation({ summary: 'Fusionner plusieurs documents en un seul PDF' })
  async mergePDFs(
    @Body() body: { items: Array<{ type: string; id: string }>; lang?: PDFLanguage },
    @Res() res: Response,
  ) {
    if (!body.items || body.items.length === 0) {
      throw new BadRequestException('Aucun document à fusionner');
    }
    const lang = body.lang || 'FR';
    const pdfBuffers: Buffer[] = [];

    for (const item of body.items) {
      let buf: Buffer;

      if (item.type === 'devis') {
        const devis = await this.prisma.devis.findUnique({
          where: { id: item.id },
          include: {
            lines: { orderBy: { order: 'asc' } },
            client: true,
            creator: { select: { first_name: true, last_name: true } },
            signature: true,
          },
        });
        if (!devis) throw new NotFoundException(`Devis ${item.id} non trouvé`);
        buf = await this.pdfService.generateDevisPDF({
          number: devis.number,
          issue_date: devis.issue_date.toISOString(),
          validity_days: devis.validity_days,
          expires_at: devis.expires_at?.toISOString() || '',
          object: devis.object || undefined,
          client: {
            commercial_name: devis.client.commercial_name,
            ice: devis.client.ice || undefined,
            rc: devis.client.rc || undefined,
            address: devis.client.address || undefined,
            city: devis.client.city || undefined,
            phone: devis.client.phone || undefined,
            email: devis.client.email || undefined,
          },
          lines: devis.lines.map((l) => ({
            description: l.description,
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
            total_ht: Number(l.total_ht),
          })),
          total_ht_brut: Number(devis.total_ht_brut),
          discount_rate: Number(devis.discount_rate),
          discount_amount: Number(devis.discount_amount),
          total_ht_net: Number(devis.total_ht_net),
          tva_rate: Number(devis.tva_rate),
          tva_amount: Number(devis.tva_amount),
          total_ttc: Number(devis.total_ttc),
          payment_terms: devis.payment_terms || undefined,
          notes: devis.notes || undefined,
          signature_url: devis.signature?.image_url || undefined,
          creator_name: `${devis.creator.first_name} ${devis.creator.last_name}`,
        }, lang);

      } else if (item.type === 'bl') {
        const bl = await this.prisma.bonLivraison.findUnique({
          where: { id: item.id },
          include: {
            lines: { orderBy: { order: 'asc' } },
            client: true,
            bc: { include: { devis: { select: { number: true } } } },
            signature: true,
            project: { select: { name: true } },
          },
        });
        if (!bl) throw new NotFoundException(`BL ${item.id} non trouvé`);
        buf = await this.pdfService.generateBLPDF({
          number: bl.number,
          bc_number: bl.bc?.number || undefined,
          devis_number: bl.bc?.devis?.number || undefined,
          issue_date: bl.issue_date.toISOString(),
          delivery_date: bl.delivery_date?.toISOString() || undefined,
          client: {
            commercial_name: bl.client.commercial_name,
            ice: bl.client.ice || undefined,
            address: bl.client.address || undefined,
            city: bl.client.city || undefined,
          },
          project_name: bl.project?.name || undefined,
          lines: bl.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity) })),
          delivered_by: bl.delivered_by || undefined,
          delivery_address: bl.delivery_address || undefined,
          notes: bl.notes || undefined,
          signature_url: bl.signature?.image_url || undefined,
        }, lang);

      } else if (item.type === 'invoice') {
        const invoice = await this.prisma.invoice.findUnique({
          where: { id: item.id },
          include: {
            lines: { orderBy: { order: 'asc' } },
            client: true,
            fournisseur: true,
            bl: { select: { number: true } },
            bc: { select: { number: true } },
            signature: true,
          },
        });
        if (!invoice) throw new NotFoundException(`Facture ${item.id} non trouvée`);
        if (invoice.direction === 'RECEIVED') {
          buf = await this.pdfService.generatePurchaseInvoicePDF({
            number: invoice.number,
            issue_date: invoice.issue_date.toISOString(),
            due_date: invoice.due_date?.toISOString() || undefined,
            fournisseur_name: (invoice.fournisseur as any)?.name || 'Fournisseur inconnu',
            total_ht: Number(invoice.total_ht_brut),
            tva_amount: Number(invoice.tva_amount),
            total_ttc: Number(invoice.total_ttc),
            notes: invoice.notes || undefined,
          });
        } else {
          if (!invoice.client) throw new NotFoundException(`Client introuvable pour facture ${item.id}`);
          buf = await this.pdfService.generateInvoicePDF({
            number: invoice.number,
            bl_number: invoice.bl?.number || undefined,
            bc_number: invoice.bc?.number || undefined,
            issue_date: invoice.issue_date.toISOString(),
            due_date: invoice.due_date?.toISOString() || undefined,
            client: {
              commercial_name: invoice.client.commercial_name,
              ice: invoice.client.ice || undefined,
              rc: invoice.client.rc || undefined,
              address: invoice.client.address || undefined,
              city: invoice.client.city || undefined,
              phone: invoice.client.phone || undefined,
              email: invoice.client.email || undefined,
            },
            lines: invoice.lines.map((l) => ({
              description: l.description,
              quantity: Number(l.quantity),
              unit_price: Number(l.unit_price),
              total_ht: Number(l.total_ht),
            })),
            total_ht_brut: Number(invoice.total_ht_brut),
            discount_rate: Number(invoice.discount_rate),
            discount_amount: Number(invoice.discount_amount),
            total_ht_net: Number(invoice.total_ht_net),
            tva_rate: Number(invoice.tva_rate),
            tva_amount: Number(invoice.tva_amount),
            total_ttc: Number(invoice.total_ttc),
            acompte_amount: Number(invoice.acompte_amount),
            balance: Number(invoice.balance),
            payment_method: invoice.payment_method || undefined,
            payment_terms: invoice.payment_terms || undefined,
            notes: invoice.notes || undefined,
            signature_url: invoice.signature?.image_url || undefined,
          }, lang);
        }

      } else {
        throw new BadRequestException('Type de document inconnu');
      }

      pdfBuffers.push(buf);
    }

    const { PDFDocument } = await import('pdf-lib');
    const mergedPdf = await PDFDocument.create();
    for (const buf of pdfBuffers) {
      const src = await PDFDocument.load(buf);
      const pages = await mergedPdf.copyPages(src, src.getPageIndices());
      pages.forEach((p) => mergedPdf.addPage(p));
    }

    const merged = Buffer.from(await mergedPdf.save());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dossier-${Date.now()}.pdf"`);
    res.send(merged);
  }
}
