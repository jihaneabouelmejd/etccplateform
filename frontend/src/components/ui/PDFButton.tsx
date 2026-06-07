'use client';

import { useState } from 'react';
import { Download, Eye, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type DocType = 'devis' | 'bl' | 'invoice' | 'bc';
type Lang = 'FR' | 'AR';

interface PDFButtonProps {
  docType: DocType;
  docId: string;
  docNumber: string;
  defaultLang?: Lang;
  variant?: 'button' | 'inline';
  className?: string;
}

const docTypeMap: Record<DocType, string> = {
  devis: 'devis',
  bl: 'bl',
  invoice: 'invoice',
  bc: 'bc',
};

export default function PDFButton({
  docType,
  docId,
  docNumber,
  defaultLang = 'FR',
  variant = 'button',
  className,
}: PDFButtonProps) {
  const [lang, setLang] = useState<Lang>(defaultLang);
  const [loading, setLoading] = useState<'preview' | 'download' | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const getUrl = (selectedLang: Lang) =>
    `/api/pdf/${docTypeMap[docType]}/${docId}?lang=${selectedLang}`;

  const fetchPdf = async (): Promise<Blob> => {
    const token = localStorage.getItem('access_token');
    const response = await fetch(getUrl(lang), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      let errMsg = `Erreur ${response.status}`;
      try {
        const json = await response.json();
        errMsg = json?.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }
    return response.blob();
  };

  const handlePreview = async () => {
    setLoading('preview');
    setPdfError(null);
    try {
      const blob = await fetchPdf();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err: any) {
      setPdfError(err?.message || 'Erreur lors de la génération du PDF');
    } finally {
      setLoading(null);
    }
  };

  const handleDownload = async () => {
    setLoading('download');
    setPdfError(null);
    try {
      const blob = await fetchPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = docType === 'devis' ? `Devis ${docNumber.replace(/^DEV-/, '')}-ETCC.pdf` : `${docNumber}-${lang}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setPdfError(err?.message || 'Erreur lors du téléchargement du PDF');
    } finally {
      setLoading(null);
    }
  };

  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex bg-honey-cream rounded-md p-0.5 border border-honey-beige-soft">
            <button
              onClick={() => { setLang('FR'); setPdfError(null); }}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                lang === 'FR' ? 'bg-honey-gold text-honey-dark' : 'text-honey-caramel'
              }`}
            >
              FR
            </button>
            <button
              onClick={() => { setLang('AR'); setPdfError(null); }}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                lang === 'AR' ? 'bg-honey-gold text-honey-dark' : 'text-honey-caramel'
              }`}
            >
              AR
            </button>
          </div>

          <button
            onClick={handlePreview}
            disabled={!!loading}
            title="Aperçu PDF"
            className="w-7 h-7 rounded-md border border-honey-beige-soft bg-white flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all disabled:opacity-50"
          >
            {loading === 'preview' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Eye size={12} />
            )}
          </button>

          <button
            onClick={handleDownload}
            disabled={!!loading}
            title="Télécharger PDF"
            className="w-7 h-7 rounded-md border border-honey-beige-soft bg-white flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all disabled:opacity-50"
          >
            {loading === 'download' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
          </button>
        </div>
        {pdfError && (
          <div className="flex items-center gap-1 text-red-600 text-[10px]">
            <AlertCircle size={10} /> {pdfError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2">
        <div className="inline-flex bg-honey-cream rounded-lg p-0.5 border border-honey-beige-soft">
          <button
            onClick={() => { setLang('FR'); setPdfError(null); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              lang === 'FR' ? 'bg-honey-gold text-honey-dark shadow-sm' : 'text-honey-caramel hover:text-honey-dark'
            }`}
          >
            FR
          </button>
          <button
            onClick={() => { setLang('AR'); setPdfError(null); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              lang === 'AR' ? 'bg-honey-gold text-honey-dark shadow-sm' : 'text-honey-caramel hover:text-honey-dark'
            }`}
          >
            AR
          </button>
        </div>

        <button
          onClick={handlePreview}
          disabled={!!loading}
          className="btn-secondary flex items-center gap-2 text-xs disabled:opacity-50"
        >
          {loading === 'preview' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Eye size={13} />
          )}
          <span>Aperçu PDF</span>
        </button>

        <button
          onClick={handleDownload}
          disabled={!!loading}
          className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50"
        >
          {loading === 'download' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Download size={13} />
          )}
          <span>Télécharger ({lang})</span>
        </button>
      </div>

      {pdfError && (
        <div className="flex items-center gap-1.5 text-red-600 text-xs bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <AlertCircle size={12} /> {pdfError}
        </div>
      )}
    </div>
  );
}
