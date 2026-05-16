'use client';

import { X, Download, FileText, Image as ImageIcon, Loader2, ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface FileViewerModalProps {
  url: string | null;
  title?: string;
  onClose: () => void;
}

function isPdf(url: string) {
  if (/\.pdf(\?.*)?$/i.test(url)) return true;
  if (/\/raw\/upload\//i.test(url)) return true;
  return false;
}

function isImage(url: string) {
  if (/\/raw\/upload\//i.test(url)) return false;
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
}

function resolveUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return url.startsWith('/') ? url : `/${url}`;
}

function isCloudinary(url: string) {
  return url.includes('cloudinary.com');
}

export default function FileViewerModal({ url, title = 'Document', onClose }: FileViewerModalProps) {
  const [imgError, setImgError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!url) return null;

  const fullUrl = resolveUrl(url);
  const fileIsPdf = isPdf(url);
  const fileIsImage = isImage(url);
  const fileIsCloudinary = isCloudinary(fullUrl);

  // Pour les PDFs Cloudinary → Google Docs viewer (contourne les restrictions iframe)
  // Pour les PDFs locaux → iframe direct (même origine, pas de restriction)
  const pdfViewerUrl = fileIsPdf && fileIsCloudinary
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(fullUrl)}&embedded=true`
    : fullUrl;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (fileIsCloudinary) {
        // Cloudinary: insérer fl_attachment dans l'URL pour forcer le téléchargement
        const urlPath = fullUrl.split('?')[0];
        const urlExt = urlPath.split('.').pop()?.toLowerCase() || '';
        const ext = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(urlExt)
          ? urlExt
          : isPdf(fullUrl) ? 'pdf' : 'jpg';
        const downloadUrl = fullUrl.includes('/raw/upload/')
          ? fullUrl.replace('/raw/upload/', '/raw/upload/fl_attachment/')
          : fullUrl.replace('/upload/', '/upload/fl_attachment/');
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${title}.${ext}`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // URL locale ou relative: fetch + blob
      const res = await fetch(fullUrl);
      const contentType = res.headers.get('content-type') || '';
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;

      const urlPath = url.split('?')[0];
      const urlExt = urlPath.split('.').pop() || '';
      let ext = '';
      if (urlExt && urlExt.length <= 4 && /^[a-zA-Z0-9]+$/.test(urlExt)) {
        ext = urlExt.toLowerCase();
      } else if (contentType.includes('pdf')) {
        ext = 'pdf';
      } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        ext = 'jpg';
      } else if (contentType.includes('png')) {
        ext = 'png';
      } else if (contentType.includes('gif')) {
        ext = 'gif';
      } else if (contentType.includes('webp')) {
        ext = 'webp';
      } else if (contentType.includes('svg')) {
        ext = 'svg';
      } else {
        ext = 'file';
      }

      a.download = `${title}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(fullUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenNewTab = () => {
    window.open(fullUrl, '_blank');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,10,0.75)', backdropFilter: 'blur(6px)' }}
      />

      {/* Modal */}
      <div className="etcc-file-modal" style={{
        position: 'relative', zIndex: 10, background: 'white', borderRadius: 16,
        width: fileIsPdf ? '92vw' : 'auto',
        maxWidth: fileIsPdf ? 960 : 720,
        height: fileIsPdf ? '90vh' : 'auto',
        maxHeight: '90vh',
        margin: '0 16px',
        boxShadow: '0 28px 80px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #F5E6D3',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'white', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg,#F4B315,#E59312)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {fileIsPdf
                ? <FileText size={16} color="#1A141A" />
                : <ImageIcon size={16} color="#1A141A" />
              }
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A141A' }}>{title}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#8E5915' }}>
                {fileIsPdf ? 'Fichier PDF' : fileIsImage ? 'Image' : 'Document'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Bouton Ouvrir dans nouvel onglet — toujours fiable pour les PDFs */}
            {fileIsPdf && (
              <button
                onClick={handleOpenNewTab}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8,
                  border: '1.5px solid #E8D4B0', background: 'white',
                  color: '#8E5915', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <ExternalLink size={12} />
                Ouvrir
              </button>
            )}

            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg,#EBB800,#755C00)',
                color: '#1A141A', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                opacity: downloading ? 0.6 : 1,
              }}
            >
              {downloading
                ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                : <Download size={12} />
              }
              Telecharger
            </button>

            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: '1.5px solid #E8D4B0', background: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={14} color="#8E5915" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflow: fileIsPdf ? 'hidden' : 'auto',
          background: '#F8F8F8', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: fileIsImage ? 20 : 0,
        }}>
          {fileIsPdf ? (
            <iframe
              src={pdfViewerUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={title}
              allowFullScreen
            />
          ) : fileIsImage && !imgError ? (
            <img
              src={fullUrl}
              alt={title}
              onError={() => setImgError(true)}
              style={{
                maxWidth: '100%', maxHeight: '70vh',
                borderRadius: 10, objectFit: 'contain',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ fontSize: 14, color: '#8E5915', marginBottom: 16 }}>
                {imgError ? "Impossible d'afficher l'image" : 'Format non preVisualisable'}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handleOpenNewTab}
                  style={{
                    padding: '10px 20px', borderRadius: 8,
                    border: '1.5px solid #E8D4B0', background: 'white',
                    color: '#8E5915', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <ExternalLink size={14} /> Ouvrir dans un onglet
                </button>
                <button
                  onClick={handleDownload}
                  style={{
                    padding: '10px 20px', borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg,#EBB800,#755C00)',
                    color: '#1A141A', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Download size={14} /> Telecharger le fichier
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
