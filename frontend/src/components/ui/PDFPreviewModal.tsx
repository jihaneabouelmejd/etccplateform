'use client';

import { useState, useEffect } from 'react';
import { X, Download, Eye, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

type Lang = 'FR' | 'AR';
type DocType = 'devis' | 'bl' | 'invoice';

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  docType: DocType;
  docId: string;
  docNumber: string;
}

export default function PDFPreviewModal({
  isOpen,
  onClose,
  docType,
  docId,
  docNumber,
}: PDFPreviewModalProps) {
  const [lang, setLang] = useState<Lang>('FR');
  const [loading, setLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const getApiUrl = (selectedLang: Lang) =>
    `/api/pdf/${docType}/${docId}?lang=${selectedLang}`;

  useEffect(() => {
    if (!isOpen) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      return;
    }
    loadPDF(lang);
  }, [isOpen, lang]);

  const loadPDF = async (selectedLang: Lang) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(getApiUrl(selectedLang), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      console.error('Error loading PDF:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${docNumber}-${lang}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-honey-dark/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-[90vw] max-w-4xl h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-honey-beige-soft bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-honey-gradient flex items-center justify-center">
              <Eye size={15} className="text-honey-dark" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-honey-dark">{docNumber}</h3>
              <p className="text-[11px] text-honey-caramel">Aperçu PDF</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Lang toggle */}
            <div className="inline-flex bg-honey-cream rounded-lg p-0.5 border border-honey-beige-soft">
              {(['FR', 'AR'] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    lang === l
                      ? 'bg-honey-gold text-honey-dark'
                      : 'text-honey-caramel hover:text-honey-dark'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Download */}
            <button
              onClick={handleDownload}
              className="btn-primary text-xs gap-1.5"
              disabled={!pdfUrl}
            >
              <Download size={12} />
              Télécharger
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:bg-honey-cream transition-all"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 bg-gray-100 relative overflow-hidden">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-honey-gradient flex items-center justify-center shadow-honey-glow animate-pulse">
                <Loader2 size={22} className="text-honey-dark animate-spin" />
              </div>
              <p className="text-sm text-honey-caramel">Génération du PDF...</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-none"
              title={`PDF ${docNumber}`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-honey-caramel">
              Erreur lors du chargement du PDF
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
