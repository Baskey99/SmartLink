import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { buildShortUrl } from '../../lib/utils';
import { Button, Input, Label } from '../ui/primitives';

export interface QrLinkTarget {
  id: string;
  linkName: string;
  shortCode: string;
  customDomain?: string | null;
}

const PRESET_SWATCHES = [
  { label: 'Slate Ink', fg: '#0F172A', bg: '#FFFFFF' },
  { label: 'Cobalt Blue', fg: '#1D4ED8', bg: '#FFFFFF' },
  { label: 'Forest', fg: '#166534', bg: '#FFFFFF' },
  { label: 'Crimson', fg: '#B91C1C', bg: '#FFFFFF' },
  { label: 'Dark Mode', fg: '#F8FAFC', bg: '#0F172A' },
];

export function QrCodeStudio({ link }: { link: QrLinkTarget }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fgColor, setFgColor] = useState('#0F172A');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [includeQrAttribution, setIncludeQrAttribution] = useState(true);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const baseShortUrl = buildShortUrl(link.shortCode, link.customDomain);
  const qrTargetUrl = includeQrAttribution ? `${baseShortUrl}?src=qr_code` : baseShortUrl;

  useEffect(() => {
    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        await QRCode.toCanvas(canvas, qrTargetUrl, {
          width: 320,
          margin: 2,
          errorCorrectionLevel: logoDataUrl ? 'H' : 'M',
          color: {
            dark: fgColor,
            light: bgColor,
          },
        });

        if (logoDataUrl) {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const img = new Image();
          img.onload = () => {
            const size = 64;
            const x = (canvas.width - size) / 2;
            const y = (canvas.height - size) / 2;
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.roundRect(x - 6, y - 6, size + 12, size + 12, 10);
            ctx.fill();
            ctx.drawImage(img, x, y, size, size);
          };
          img.src = logoDataUrl;
        }
      } catch (err) {
        console.error('QR render failed:', err);
      }
    };
    void render();
  }, [qrTargetUrl, fgColor, bgColor, logoDataUrl]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(baseShortUrl);
    setCopied(true);
    toast.success('Short URL copied');
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadPng = async () => {
    const exportCanvas = document.createElement('canvas');
    await QRCode.toCanvas(exportCanvas, qrTargetUrl, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: logoDataUrl ? 'H' : 'M',
      color: { dark: fgColor, light: bgColor },
    });

    const finalize = () => {
      const dataUrl = exportCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `smartlink-${link.shortCode}.png`;
      a.click();
      toast.success('Downloaded high-resolution PNG QR code');
    };

    if (logoDataUrl) {
      const ctx = exportCanvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        if (ctx) {
          const size = 200;
          const x = (exportCanvas.width - size) / 2;
          const y = (exportCanvas.height - size) / 2;
          ctx.fillStyle = bgColor;
          ctx.beginPath();
          ctx.roundRect(x - 18, y - 18, size + 36, size + 36, 28);
          ctx.fill();
          ctx.drawImage(img, x, y, size, size);
        }
        finalize();
      };
      img.src = logoDataUrl;
    } else {
      finalize();
    }
  };

  const handleDownloadSvg = async () => {
    try {
      const svgString = await QRCode.toString(qrTargetUrl, {
        type: 'svg',
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: fgColor, light: bgColor },
      });
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartlink-${link.shortCode}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Downloaded SVG QR code');
    } catch {
      toast.error('Failed to export SVG');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error('Logo image must be under 1 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
      {/* Live Preview */}
      <div className="md:col-span-5 flex flex-col items-center">
        <div
          className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-center"
          style={{ backgroundColor: bgColor }}
        >
          <canvas ref={canvasRef} className="w-[240px] h-[240px] rounded" />
        </div>
        <div className="mt-3 text-center w-full">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {link.linkName}
          </p>
          <code className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 break-all">
            {qrTargetUrl}
          </code>
        </div>
      </div>

      {/* Customization Controls */}
      <div className="md:col-span-7 space-y-5">
        <div>
          <Label>Color Presets</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_SWATCHES.map((swatch) => (
              <button
                key={swatch.label}
                type="button"
                onClick={() => {
                  setFgColor(swatch.fg);
                  setBgColor(swatch.bg);
                }}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <span
                  className="h-3.5 w-3.5 rounded-sm border border-slate-300 dark:border-slate-600"
                  style={{ backgroundColor: swatch.fg }}
                />
                <span>{swatch.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="qr-fg">Foreground Color</Label>
            <div className="flex items-center gap-2">
              <input
                id="qr-fg"
                type="color"
                value={fgColor}
                onChange={(e) => setFgColor(e.target.value)}
                className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent cursor-pointer"
              />
              <Input
                value={fgColor}
                onChange={(e) => setFgColor(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="qr-bg">Background Color</Label>
            <div className="flex items-center gap-2">
              <input
                id="qr-bg"
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent cursor-pointer"
              />
              <Input
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <div>
          <Label>Center Logo (Optional)</Label>
          <div className="flex items-center gap-2.5">
            <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
              <ImagePlus className="h-3.5 w-3.5" />
              <span>{logoDataUrl ? 'Replace Logo' : 'Upload Logo'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
            {logoDataUrl && (
              <Button variant="ghost" size="sm" onClick={() => setLogoDataUrl(null)}>
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove</span>
              </Button>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeQrAttribution}
            onChange={(e) => setIncludeQrAttribution(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <span>Tag scans with QR Code referral attribution (?src=qr_code)</span>
        </label>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2.5">
          <Button variant="primary" size="sm" onClick={() => void handleDownloadPng()}>
            <Download className="h-3.5 w-3.5" />
            <span>Download PNG</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void handleDownloadSvg()}>
            <Download className="h-3.5 w-3.5" />
            <span>Download SVG</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Short URL'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
