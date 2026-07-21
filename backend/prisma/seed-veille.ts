/**
 * Seed additif — module VEILLE (plateforme de veille commerciale).
 * Insère les entreprises à surveiller par défaut, réparties par catégorie.
 * Idempotent : une entreprise déjà présente (même nom) n'est pas dupliquée.
 * Ne touche à aucune autre table / aucun autre module.
 *
 * Usage : npx ts-node prisma/seed-veille.ts
 */
import { PrismaClient, EntrepriseType } from '@prisma/client';

const prisma = new PrismaClient();

const PAGES_PAR_DEFAUT = [
  '/appels-offres',
  '/consultations',
  '/procurement',
  '/achats',
  '/suppliers',
  '/fournisseurs',
  '/vendor',
  '/rfq',
  '/rfp',
  '/tenders',
  '/news',
  '/actualites',
  '/projets',
];

interface Categorie {
  label: string;
  type: EntrepriseType;
  entreprises: string[];
}

const CATEGORIES: Categorie[] = [
  {
    label: 'Promotion immobilière',
    type: EntrepriseType.PROMOTEUR,
    entreprises: [
      'Addoha',
      'Alliances Développement Immobilier',
      'Résidences Dar Saada',
      'CGI',
      'Yamed Group',
      'Eagle Hills Morocco',
      'Al Omrane',
      'Chaabi Lil Iskane',
      'Mfadel Group',
      'KLK Khayatey Living',
      'Prestigia',
      'Palmeraie Développement',
    ],
  },
  {
    label: 'Construction',
    type: EntrepriseType.CONSTRUCTION,
    entreprises: [
      'TGCC',
      'Jet Contractors',
      'SGTM',
      'GTR',
      'Sogea Maroc',
      'STAM',
      'Sintram',
      'Houar',
      'Mojazine',
      'Bioui Travaux',
    ],
  },
  {
    label: 'Industrie',
    type: EntrepriseType.INDUSTRIE,
    entreprises: [
      'OCP Group',
      'Managem',
      'Cosumar',
      'LafargeHolcim Maroc',
      'Ciments du Maroc',
      'Sonasid',
      'Maghreb Steel',
      'Aluminium du Maroc',
      'Lesieur Cristal',
      'SNEP',
      'Centrale Danone',
      'Fromageries Bel Maroc',
    ],
  },
  {
    label: 'Automobile',
    type: EntrepriseType.AUTOMOBILE,
    entreprises: [
      'Renault Group Maroc',
      'Stellantis Kenitra',
      'Lear',
      'Aptiv',
      'Yazaki',
      'Sumitomo',
      'SEBN MA',
      'Leoni',
      'Valeo',
    ],
  },
  {
    label: 'Aéronautique',
    type: EntrepriseType.AERONAUTIQUE,
    entreprises: [
      'Safran',
      'Airbus Atlantic Maroc',
      'Spirit AeroSystems Morocco',
      'Eaton',
      'Collins Aerospace',
    ],
  },
  {
    label: 'Énergie',
    type: EntrepriseType.ENERGIE,
    entreprises: [
      'Nareva',
      'TAQA Morocco',
      'ACWA Power Morocco',
      'Green of Africa',
      'TotalEnergies Marketing Maroc',
      'Vivo Energy Maroc',
      'Afriquia',
    ],
  },
  {
    label: 'Hôtellerie',
    type: EntrepriseType.HOTELLERIE,
    entreprises: [
      'Accor',
      'Hilton',
      'Marriott',
      'Radisson',
      'Barceló',
      'Kenzi Hotels',
      'Atlas Hospitality',
      'Tikida Hotels',
    ],
  },
  {
    label: 'Grande distribution',
    type: EntrepriseType.DISTRIBUTION,
    entreprises: [
      'Marjane Holding',
      'LabelVie',
      'Aswak Assalam',
      'BIM Maroc',
      'IKEA Maroc',
      'Morocco Mall',
      'AnfaPlace Mall',
    ],
  },
  {
    label: 'Santé',
    type: EntrepriseType.SANTE,
    entreprises: ['Akdital', 'Oncorad', 'Hôpital Universitaire International Mohammed VI'],
  },
  {
    label: 'Logistique',
    type: EntrepriseType.LOGISTIQUE,
    entreprises: ['Marsa Maroc', 'Tanger Med', 'ONCF', 'ADM', 'Casa Transport'],
  },
  {
    label: 'Enseignement privé',
    type: EntrepriseType.ENSEIGNEMENT,
    entreprises: [
      'Université Internationale de Casablanca',
      'Universiapolis',
      'Université Privée de Marrakech',
      'ESCA',
    ],
  },
];

async function main() {
  console.log('🔎 VEILLE — Seed des entreprises à surveiller...\n');

  let created = 0;
  let skipped = 0;

  for (const cat of CATEGORIES) {
    for (const nom of cat.entreprises) {
      const existing = await prisma.entreprise.findFirst({ where: { nom } });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.entreprise.create({
        data: {
          nom,
          secteur: cat.label,
          type_entreprise: cat.type,
          categorie_defaut: cat.label,
          pages_surveillees: PAGES_PAR_DEFAUT,
          // Statut A_CONFIGURER par défaut : aucun site officiel/sélecteur
          // n'est pré-renseigné, l'admin les complète depuis "Sources à
          // configurer" (aucune modification de code nécessaire).
        },
      });
      created++;
    }
  }

  const total = CATEGORIES.reduce((sum, c) => sum + c.entreprises.length, 0);
  console.log(`✅ ${created} entreprise(s) créée(s), ${skipped} déjà existante(s) (total catalogue : ${total})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed veille failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
