import type { ServicePoint, Ticket } from '../types/database';
import {
  formatMinutesLabel,
  getDisplayPurpose,
  isPriorityTicket,
  resolveAssignedWindow,
  type StudentWaitEstimate,
} from './waitTime';

interface BoardingPassExportParams {
  ticket: Ticket;
  servicePoint: ServicePoint | null;
  qrCanvas: HTMLCanvasElement;
  waitEstimate: StudentWaitEstimate;
  position: number;
  isDark: boolean;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawTruncatedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
) {
  let output = text;
  if (ctx.measureText(output).width <= maxWidth) {
    ctx.fillText(output, x, y);
    return;
  }
  while (output.length > 3 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  ctx.fillText(`${output}…`, x, y);
}

export function downloadBoardingPassPng({
  ticket,
  servicePoint,
  qrCanvas,
  waitEstimate,
  position,
  isDark,
}: BoardingPassExportParams): void {
  const width = 460;
  const height = 740;
  const scale = 2; // 2x retina crispness (920x1480 output)

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  ctx.scale(scale, scale);

  const priority = isPriorityTicket(ticket);
  const cleanedPurpose = getDisplayPurpose(ticket.purpose);
  const payload = `LINYAIIT:${ticket.id}:${ticket.ticket_number}`;
  const issuedDate = new Date(ticket.created_at);
  const formattedTime = issuedDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const formattedDate = issuedDate.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const assignedWindow = resolveAssignedWindow(ticket, servicePoint);

  // Theme-aware accessible palette (no #7A0019 text/borders on dark surfaces)
  const palette = isDark
    ? {
        pageBg: '#020617',
        cardBg: '#0F172A',
        cardBorder: '#1E293B',
        headerBg: ticket.status === 'called' ? '#059669' : '#1E293B',
        headerAccent: '#FBBF24',
        headerText: '#FFFFFF',
        ticketColor: ticket.status === 'called' ? '#34D399' : '#FB7185',
        primaryText: '#F8FAFC',
        secondaryText: '#94A3B8',
        mutedBoxBg: '#1E293B',
        mutedBoxBorder: '#334155',
        divider: '#334155',
        laneBg: priority ? '#FBBF24' : '#F43F5E',
        laneText: '#020617',
      }
    : {
        pageBg: '#F1F5F9',
        cardBg: '#FFFFFF',
        cardBorder: '#E2E8F0',
        headerBg: ticket.status === 'called' ? '#059669' : '#7A0019',
        headerAccent: '#FBBF24',
        headerText: '#FFFFFF',
        ticketColor: ticket.status === 'called' ? '#059669' : '#7A0019',
        primaryText: '#0F172A',
        secondaryText: '#475569',
        mutedBoxBg: '#F8FAFC',
        mutedBoxBorder: '#E2E8F0',
        divider: '#CBD5E1',
        laneBg: priority ? '#FEF3C7' : '#FDF2F4',
        laneText: priority ? '#92400E' : '#7A0019',
      };

  // Outer canvas background
  ctx.fillStyle = palette.pageBg;
  ctx.fillRect(0, 0, width, height);

  // Card body
  const cardX = 20;
  const cardY = 20;
  const cardW = width - 40;
  const cardH = height - 40;
  const splitY = 472;

  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = palette.cardBg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = palette.cardBorder;
  ctx.stroke();
  ctx.clip();

  // Top Header Strip
  ctx.fillStyle = palette.headerBg;
  ctx.fillRect(cardX, cardY, cardW, 92);

  // Accent gold bar at bottom of header
  ctx.fillStyle = palette.headerAccent;
  ctx.fillRect(cardX, cardY + 89, cardW, 3);

  // Header Brand Text
  ctx.fillStyle = palette.headerAccent;
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MSU-IIT • LINYAIIT DIGITAL BOARDING PASS', cardX + 24, cardY + 34);

  ctx.fillStyle = palette.headerText;
  ctx.font = '800 20px Inter, system-ui, sans-serif';
  const headerSubtitle =
    ticket.status === 'called'
      ? `NOW SERVING — ${assignedWindow.toUpperCase()}`
      : 'SMART CAMPUS QUEUE PASS';
  drawTruncatedText(ctx, headerSubtitle, cardX + 24, cardY + 66, cardW - 48);

  // Lane Badge (Priority / Regular) + Status Pill
  const badgeY = cardY + 114;
  const laneLabel = priority ? '★ PRIORITY LANE' : 'REGULAR LANE';
  ctx.font = '800 11px Inter, system-ui, sans-serif';
  const laneWidth = ctx.measureText(laneLabel).width + 24;

  roundRectPath(ctx, cardX + 24, badgeY, laneWidth, 26, 13);
  ctx.fillStyle = palette.laneBg;
  ctx.fill();
  ctx.fillStyle = palette.laneText;
  ctx.textAlign = 'left';
  ctx.fillText(laneLabel, cardX + 36, badgeY + 17);

  // Right-aligned counter code badge
  const counterLabel = servicePoint ? `COUNTER ${servicePoint.code}` : 'CAMPUS QUEUE';
  const counterW = ctx.measureText(counterLabel).width + 22;
  roundRectPath(ctx, cardX + cardW - 24 - counterW, badgeY, counterW, 26, 13);
  ctx.fillStyle = palette.mutedBoxBg;
  ctx.fill();
  ctx.strokeStyle = palette.mutedBoxBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = palette.secondaryText;
  ctx.fillText(counterLabel, cardX + cardW - 24 - counterW + 11, badgeY + 17);

  // Ticket Number
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.secondaryText;
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.fillText('TICKET NUMBER', width / 2, cardY + 172);

  ctx.fillStyle = palette.ticketColor;
  ctx.font = '800 68px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(ticket.ticket_number, width / 2, cardY + 236);

  // Service Point Name & Location
  ctx.fillStyle = palette.primaryText;
  ctx.font = '700 17px Inter, system-ui, sans-serif';
  drawTruncatedText(
    ctx,
    servicePoint?.name ?? 'Campus Service Counter',
    width / 2,
    cardY + 272,
    cardW - 48
  );

  ctx.fillStyle = palette.secondaryText;
  ctx.font = '500 12px Inter, system-ui, sans-serif';
  drawTruncatedText(
    ctx,
    servicePoint?.location ?? 'MSU-IIT Campus',
    width / 2,
    cardY + 294,
    cardW - 48
  );

  // Info Boxes Row (Position / Window + Est. Wait + Issued Time)
  const boxY = cardY + 318;
  const boxGap = 10;
  const boxW = (cardW - 48 - boxGap * 2) / 3;
  const boxH = 66;

  const boxes = [
    {
      label: ticket.status === 'called' ? 'WINDOW' : 'POSITION',
      value:
        ticket.status === 'called'
          ? assignedWindow
          : ticket.status === 'waiting'
          ? `#${position}`
          : ticket.status.toUpperCase(),
      sub: ticket.status === 'called' ? 'Proceed now' : 'In queue',
    },
    {
      label: 'EST. WAIT',
      value:
        ticket.status === 'called'
          ? 'NOW'
          : formatMinutesLabel(waitEstimate.estimatedMinutes),
      sub: waitEstimate.isLiveCalculated ? 'Live-calculated' : 'Estimated',
    },
    {
      label: 'ISSUED',
      value: formattedTime,
      sub: formattedDate,
    },
  ];

  boxes.forEach((box, i) => {
    const bx = cardX + 24 + i * (boxW + boxGap);
    roundRectPath(ctx, bx, boxY, boxW, boxH, 12);
    ctx.fillStyle = palette.mutedBoxBg;
    ctx.fill();
    ctx.strokeStyle = palette.mutedBoxBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = palette.secondaryText;
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.fillText(box.label, bx + boxW / 2, boxY + 18);

    ctx.fillStyle = palette.primaryText;
    ctx.font = '800 15px "JetBrains Mono", Inter, sans-serif';
    drawTruncatedText(ctx, box.value, bx + boxW / 2, boxY + 40, boxW - 12);

    ctx.fillStyle = palette.secondaryText;
    ctx.font = '500 10px Inter, system-ui, sans-serif';
    drawTruncatedText(ctx, box.sub, bx + boxW / 2, boxY + 56, boxW - 12);
  });

  // Student Name / Purpose Footer inside Upper Half
  const metaTextParts: string[] = [];
  if (ticket.student_name) metaTextParts.push(`Student: ${ticket.student_name}`);
  if (cleanedPurpose) metaTextParts.push(`Purpose: ${cleanedPurpose}`);
  if (metaTextParts.length > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = palette.secondaryText;
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    drawTruncatedText(ctx, metaTextParts.join('  •  '), width / 2, cardY + 412, cardW - 48);
  }

  // Perforated Dashed Divider
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = palette.divider;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cardX + 18, splitY);
  ctx.lineTo(cardX + cardW - 18, splitY);
  ctx.stroke();
  ctx.restore();

  // Lower Verification Stub: QR Code + Payload
  const qrBoxSize = 148;
  const qrPad = 12;
  const qrX = cardX + 28;
  const qrY = splitY + 34;

  // Always draw crisp white pad behind QR code for guaranteed scannability
  roundRectPath(ctx, qrX, qrY, qrBoxSize, qrBoxSize, 14);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw the actual QRCodeCanvas element directly onto the offscreen canvas
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    qrCanvas,
    qrX + qrPad,
    qrY + qrPad,
    qrBoxSize - qrPad * 2,
    qrBoxSize - qrPad * 2
  );
  ctx.restore();

  // Right-side Verification Copy
  const infoX = qrX + qrBoxSize + 22;
  const infoMaxW = cardX + cardW - infoX - 24;
  ctx.textAlign = 'left';

  ctx.fillStyle = palette.primaryText;
  ctx.font = '800 15px Inter, system-ui, sans-serif';
  ctx.fillText('Counter Verification', infoX, qrY + 26);

  ctx.fillStyle = palette.secondaryText;
  ctx.font = '500 12px Inter, system-ui, sans-serif';
  ctx.fillText('Present this boarding pass', infoX, qrY + 48);
  ctx.fillText('when your ticket is called.', infoX, qrY + 65);

  ctx.fillStyle = palette.secondaryText;
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.fillText('VERIFICATION PAYLOAD', infoX, qrY + 98);

  ctx.fillStyle = palette.primaryText;
  ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
  drawTruncatedText(ctx, `LINYAIIT:${ticket.ticket_number}`, infoX, qrY + 116, infoMaxW);

  ctx.fillStyle = palette.secondaryText;
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
  drawTruncatedText(ctx, `ID: ${ticket.id.slice(0, 18)}…`, infoX, qrY + 134, infoMaxW);

  // Bottom verification string strip
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.secondaryText;
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
  drawTruncatedText(ctx, payload, width / 2, cardY + cardH - 22, cardW - 48);

  ctx.restore();

  // Semicircular Perforation Notches on Left & Right Card Edges
  const drawNotch = (cx: number) => {
    ctx.beginPath();
    ctx.arc(cx, splitY, 14, 0, Math.PI * 2);
    ctx.fillStyle = palette.pageBg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.cardBorder;
    ctx.stroke();

    // Mask outside stroke cleanly
    ctx.fillStyle = palette.pageBg;
    if (cx === cardX) {
      ctx.fillRect(cardX - 18, splitY - 16, 18, 32);
    } else {
      ctx.fillRect(cardX + cardW, splitY - 16, 18, 32);
    }
  };

  drawNotch(cardX);
  drawNotch(cardX + cardW);

  // Trigger PNG download
  const fileName = `LinyaIIT-Pass-${ticket.ticket_number}.png`;
  const triggerDownload = (url: string, revokeAfter: boolean) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (revokeAfter) {
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  };

  if (canvas.toBlob) {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          triggerDownload(canvas.toDataURL('image/png'), false);
          return;
        }
        triggerDownload(URL.createObjectURL(blob), true);
      },
      'image/png',
      1.0
    );
  } else {
    triggerDownload(canvas.toDataURL('image/png'), false);
  }
}