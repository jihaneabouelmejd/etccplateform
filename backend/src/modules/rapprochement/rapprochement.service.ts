import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FournisseursService } from '../fournisseurs/fournisseurs.service';

interface ParsedLine {
  date: Date;
  amount: number;
  is_credit: boolean;
  description: string;
  beneficiary?: string;
  rib_detected?: string;
  reference?: string;
}

@Injectable()
export class RapprochementService {
  constructor(
    private prisma: PrismaService,
    private fournisseurs: FournisseursService,
  ) {}

  parseBankCSV(csvContent: string): ParsedLine[] {
    const lines = csvContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const parsed: ParsedLine[] = [];

    for (const line of lines) {
      if (line.match(/^(date|libellé|débit|crédit|solde)/i)) continue;

      const cols = line.split(';').map((c) => c.trim().replace(/"/g, ''));
      if (cols.length < 3) continue;

      try {
        const dateStr = cols[0];
        const description = cols[1] || '';
        const debit = parseFloat(cols[2]?.replace(',', '.') || '0') || 0;
        const credit = parseFloat(cols[3]?.replace(',', '.') || '0') || 0;

        if (!dateStr || (debit === 0 && credit === 0)) continue;

        const ribMatch = description.match(/(\d{7,24})/g);
        const rib_detected = ribMatch
          ? ribMatch.sort((a, b) => b.length - a.length)[0]
          : undefined;

        const beneficiaryMatch = description.match(
          /(?:VIR|CHQ|ESP|EFF)\s+(.+?)(?:\s+\d|$)/i,
        );
        const beneficiary = beneficiaryMatch?.[1]?.trim();

        const refMatch = description.match(/(?:REF|VIR|N°)[:\s]?([A-Z0-9\-]+)/i);
        const reference = refMatch?.[1];

        const parsedDate = this.parseDate(dateStr);
        if (!parsedDate) continue;

        parsed.push({
          date: parsedDate,
          amount: debit > 0 ? debit : credit,
          is_credit: credit > 0,
          description,
          beneficiary,
          rib_detected,
          reference,
        });
      } catch {
        continue;
      }
    }

    return parsed;
  }

  private parseDate(str: string): Date | null {
    const parts = str.split(/[\/\-]/);
    if (parts.length !== 3) return null;

    try {
      if (parts[0].length === 4) {
        return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
      }
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } catch {
      return null;
    }
  }

  async importStatement(
    data: {
      csvContent: string;
      bank_name?: string;
      account?: string;
      period_from: Date;
      period_to: Date;
    },
    uploadedBy: string,
  ) {
    const parsedLines = this.parseBankCSV(data.csvContent);

    const statement = await this.prisma.bankStatement.create({
      data: {
        file_url: '',
        bank_name: data.bank_name,
        account: data.account,
        period_from: data.period_from,
        period_to: data.period_to,
        uploaded_by: uploadedBy,
      },
    });

    const results = { matched: 0, suggested: 0, no_invoice: 0, unmatched: 0 };

    for (const line of parsedLines) {
      const matchResult = await this.matchLine(line);

      await this.prisma.bankStatementLine.create({
        data: {
          statement_id: statement.id,
          date: line.date,
          amount: line.amount,
          is_credit: line.is_credit,
          description: line.description,
          beneficiary: line.beneficiary,
          rib_detected: line.rib_detected,
          reference: line.reference,
          match_status: matchResult.status as any,
          match_score: matchResult.score,
          matched_invoice_id: matchResult.invoice_id,
          alert_id: matchResult.alert_id,
        },
      });

      if (matchResult.status === 'MATCHED') results.matched++;
      else if (matchResult.status === 'SUGGESTED') results.suggested++;
      else if (matchResult.status === 'NO_INVOICE') results.no_invoice++;
      else results.unmatched++;
    }

    return { statement, lines_count: parsedLines.length, results };
  }

  private async matchLine(line: ParsedLine): Promise<{
    status: string;
    score: number;
    invoice_id?: string;
    alert_id?: string;
  }> {
    if (line.is_credit) {
      const invoice = await this.findMatchingIssuedInvoice(
        line.amount,
        line.date,
      );
      if (invoice) return { status: 'MATCHED', score: 90, invoice_id: invoice.id };
      return { status: 'UNMATCHED', score: 0 };
    }

    // ✅ Fix: typage explicite
    let fournisseur: { id: string; name: string } | null = null;

    if (line.rib_detected) {
      const found = await this.fournisseurs.findByRib(line.rib_detected);
      if (found) {
        fournisseur = { id: found.id, name: found.name };
      }
    }

    if (fournisseur) {
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          direction: 'RECEIVED',
          fournisseur_id: fournisseur.id,
          status: { not: 'PAID' },
          total_ttc: {
            gte: line.amount - 5,
            lte: line.amount + 5,
          },
          issue_date: {
            gte: new Date(line.date.getTime() - 30 * 24 * 60 * 60 * 1000),
            lte: new Date(line.date.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      });

      if (invoice) {
        return { status: 'MATCHED', score: 95, invoice_id: invoice.id };
      }

      // 🚨 Fournisseur connu mais aucune facture
      const alert = await this.prisma.alert.create({
        data: {
          type: 'NO_INVOICE_FOUND',
          title: `Virement sans facture: ${fournisseur.name}`,
          description: `Virement de ${line.amount} MAD vers ${fournisseur.name} (${line.date.toLocaleDateString('fr-FR')}) sans facture associée.`,
          severity: 'DANGER',
          amount: line.amount,
          related_type: 'Fournisseur',
          related_id: fournisseur.id,
          target_role: 'COMPTABLE',
        },
      });

      return { status: 'NO_INVOICE', score: 70, alert_id: alert.id };
    }

    const approxInvoice = await this.prisma.invoice.findFirst({
      where: {
        direction: 'RECEIVED',
        status: { not: 'PAID' },
        total_ttc: { gte: line.amount - 5, lte: line.amount + 5 },
        issue_date: {
          gte: new Date(line.date.getTime() - 30 * 24 * 60 * 60 * 1000),
          lte: new Date(line.date.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    if (approxInvoice) {
      return { status: 'SUGGESTED', score: 60, invoice_id: approxInvoice.id };
    }

    return { status: 'UNMATCHED', score: 0 };
  }

  private async findMatchingIssuedInvoice(amount: number, date: Date) {
    return this.prisma.invoice.findFirst({
      where: {
        direction: 'ISSUED',
        status: { not: 'PAID' },
        total_ttc: { gte: amount - 5, lte: amount + 5 },
        issue_date: {
          gte: new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000),
          lte: new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    });
  }

  async confirmMatch(lineId: string, invoiceId: string, matchedBy: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.bankStatementLine.update({
        where: { id: lineId },
        data: {
          match_status: 'MATCHED',
          matched_invoice_id: invoiceId,
          matched_at: new Date(),
          matched_by: matchedBy,
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { reconciled: true },
      });

      return { success: true };
    });
  }

  async markNoInvoice(lineId: string, justification?: string) {
    const line = await this.prisma.bankStatementLine.findUnique({
      where: { id: lineId },
    });
    if (!line) throw new NotFoundException('Ligne non trouvée');

    let alertId = line.alert_id;
    if (!alertId) {
      const alert = await this.prisma.alert.create({
        data: {
          type: 'NO_INVOICE_FOUND',
          title: `Paiement sans facture: ${Number(line.amount)} MAD`,
          description:
            justification ||
            `Paiement du ${line.date.toLocaleDateString('fr-FR')} sans facture associée.`,
          severity: 'DANGER',
          amount: line.amount,
          target_role: 'COMPTABLE',
        },
      });
      alertId = alert.id;
    }

    return this.prisma.bankStatementLine.update({
      where: { id: lineId },
      data: { match_status: 'NO_INVOICE', alert_id: alertId },
    });
  }

  async importScan(data: {
    file_url: string;
    bank_name?: string;
    account?: string;
    period_from: Date;
    period_to: Date;
  }, uploadedBy: string) {
    return this.prisma.bankStatement.create({
      data: {
        file_url: data.file_url,
        bank_name: data.bank_name,
        account: data.account,
        period_from: data.period_from,
        period_to: data.period_to,
        uploaded_by: uploadedBy,
      },
      include: { _count: { select: { lines: true } } },
    });
  }

  async deleteStatement(id: string) {
    return this.prisma.bankStatement.delete({ where: { id } });
  }

  async getStatements(page = 1) {
    const limit = 20;
    const [data, total] = await Promise.all([
      this.prisma.bankStatement.findMany({
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { lines: true } } },
      }),
      this.prisma.bankStatement.count(),
    ]);
    return {
      data,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  async getStatementLines(statementId: string, status?: string) {
    const where: any = { statement_id: statementId };
    if (status) where.match_status = status;

    return this.prisma.bankStatementLine.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { alert: true },
    });
  }

  async getSummary(statementId: string) {
    const lines = await this.prisma.bankStatementLine.groupBy({
      by: ['match_status'],
      where: { statement_id: statementId },
      _count: true,
      _sum: { amount: true },
    });

    return lines.reduce(
      (acc, item) => {
        acc[item.match_status] = {
          count: item._count,
          total: Number(item._sum.amount || 0),
        };
        return acc;
      },
      {} as Record<string, { count: number; total: number }>,
    );
  }
}
