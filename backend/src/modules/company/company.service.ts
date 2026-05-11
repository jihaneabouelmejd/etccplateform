import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Récupérer les infos de la société (il n'y en a qu'une)
   */
  async get() {
    const company = await this.prisma.company.findFirst();
    if (!company) {
      throw new NotFoundException('Informations société non configurées');
    }
    return company;
  }

  /**
   * Créer ou mettre à jour les infos de la société
   */
  async upsert(data: {
    commercial_name: string;
    legal_name: string;
    ice: string;
    rc?: string;
    if?: string;
    cnss?: string;
    patente?: string;
    tva_intra?: string;
    legal_form?: string;
    capital?: number;
    address_line: string;
    postal_code?: string;
    city: string;
    country?: string;
    phone?: string;
    mobile?: string;
    email?: string;
    website?: string;
    logo_url?: string;
    primary_color?: string;
    bank_name?: string;
    rib?: string;
    iban?: string;
    swift?: string;
  }) {
    const existing = await this.prisma.company.findFirst();

    if (existing) {
      return this.prisma.company.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.company.create({ data });
  }

  /**
   * Données nécessaires pour générer un PDF (header/footer)
   */
  async getPdfData() {
    const company = await this.get();
    return {
      name: company.commercial_name,
      legal_name: company.legal_name,
      ice: company.ice,
      rc: company.rc,
      if: company.if,
      cnss: company.cnss,
      patente: company.patente,
      address: `${company.address_line}, ${company.city}`,
      phone: company.phone || company.mobile,
      email: company.email,
      logo_url: company.logo_url,
      bank: company.bank_name,
      rib: company.rib,
      iban: company.iban,
      swift: company.swift,
    };
  }
}
