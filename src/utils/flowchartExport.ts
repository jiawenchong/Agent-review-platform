import { renderMermaidSvg } from '../components/Mermaid';

async function svgToPngDataUrl(svgText: string, scale = 2): Promise<{ dataUrl: string; width: number; height: number }> {
  const svgEl = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;

  let width = parseFloat(svgEl.getAttribute('width') || '0');
  let height = parseFloat(svgEl.getAttribute('height') || '0');
  if (!width || !height) {
    const viewBox = svgEl.getAttribute('viewBox')?.split(/\s+/).map(Number);
    if (viewBox && viewBox.length === 4) {
      width = viewBox[2];
      height = viewBox[3];
    }
  }
  width = width || 1200;
  height = height || 800;

  // Mermaid's dark-theme SVG root has no explicit background — paint one so
  // the exported slide image matches the black canvas shown on screen.
  svgEl.setAttribute('style', `${svgEl.getAttribute('style') ?? ''};background:#000000;`);

  const svgUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml;charset=utf-8' }),
  );

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('流程圖圖片轉換失敗'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('無法建立畫布轉換流程圖');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return { dataUrl: canvas.toDataURL('image/png'), width, height };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function exportFlowchartToPptx(opts: {
  chart: string;
  title: string;
  subtitle?: string;
  fileName: string;
}): Promise<void> {
  const svg = await renderMermaidSvg(opts.chart);
  const { dataUrl, width, height } = await svgToPngDataUrl(svg);

  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'FLOW', width: 13.33, height: 7.5 });
  pptx.layout = 'FLOW';

  const slide = pptx.addSlide();
  slide.background = { color: '000000' };

  slide.addText(opts.title, {
    x: 0.4, y: 0.25, w: 12.5, h: 0.6,
    fontFace: 'Microsoft YaHei', fontSize: 22, bold: true, color: 'D4A017',
  });
  if (opts.subtitle) {
    slide.addText(opts.subtitle, {
      x: 0.4, y: 0.85, w: 12.5, h: 0.4,
      fontFace: 'Microsoft YaHei', fontSize: 12, color: '888888',
    });
  }

  // Fit the image within the remaining slide area, preserving aspect ratio.
  const areaX = 0.4, areaY = 1.35, areaW = 12.5, areaH = 5.75;
  const scale = Math.min(areaW / width, areaH / height);
  const w = width * scale;
  const h = height * scale;
  slide.addImage({ data: dataUrl, x: areaX + (areaW - w) / 2, y: areaY + (areaH - h) / 2, w, h });

  await pptx.writeFile({ fileName: opts.fileName });
}
