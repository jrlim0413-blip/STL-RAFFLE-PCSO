import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';

const WINNER_HEADERS = [
  'Round',
  'Premyo',
  'Ticket Number',
  'Huling 6',
  'Buong Pangalan',
  'Contact',
  'Username',
  'Supervisor',
  'Petsa / Oras'
];

const ENTRY_HEADERS = [
  'Ticket Number',
  'Huling 6',
  'Buong Pangalan',
  'Contact Number',
  'Agent Username',
  'Supervisor',
  'Tasks',
  'Status',
  'Petsa'
];

function formatManilaTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function sanitizeFileSlug(text) {
  return String(text || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report';
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revocation slightly so Chromium finishes reading the blob stream
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildWinnerRows(results = []) {
  return results.map((item) => {
    const winner = item.winner || {};
    const ticket = winner.ticket || '';
    return [
      `Round ${item.round}`,
      item.prize || '—',
      ticket || '—',
      ticket ? ticket.slice(-6) : '—',
      winner.agent || '—',
      winner.contact || '—',
      winner.agentUsername || '—',
      winner.supervisorName || '—',
      formatManilaTimestamp(item.drawnAt)
    ];
  });
}

function buildEntryRows(entries = []) {
  return entries.map((entry) => {
    const totalTasks = entry.totalTasks ?? 0;
    const tasksCompleted = entry.tasksCompleted ?? 0;
    const isAllDone = totalTasks > 0 && tasksCompleted >= totalTasks;
    const statusLabel = isAllDone || entry.status === 'Eligible'
      ? 'Eligible'
      : totalTasks > 0
        ? `Kulang (${tasksCompleted}/${totalTasks})`
        : 'Pending Review';
    return [
      entry.ticket || '—',
      entry.ticket ? entry.ticket.slice(-6) : '—',
      entry.agent || '—',
      entry.contact || '—',
      entry.agentUsername || '—',
      entry.supervisorName || '—',
      totalTasks > 0 ? `${tasksCompleted}/${totalTasks}` : '—',
      statusLabel,
      formatManilaTimestamp(entry.timestamp || entry.createdAt)
    ];
  });
}

function buildPdfDocument({ title, subtitle, headers, rows, filename, isHighlightRow }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedLabel = `Nagawa noong: ${formatManilaTimestamp()}`;

  // Official navy header band
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageWidth, 68, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 32, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(219, 234, 254);
  doc.text(subtitle, 32, 48);

  doc.setFontSize(8.5);
  doc.text(generatedLabel, pageWidth - 32, 48, { align: 'right' });

  autoTable(doc, {
    startY: 84,
    head: [headers],
    body: rows,
    theme: 'grid',
    margin: { left: 32, right: 32, bottom: 42 },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 6,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    didParseCell: (data) => {
      if (data.section === 'body' && typeof isHighlightRow === 'function' && isHighlightRow(data.row.index, data.row.raw)) {
        data.cell.styles.fillColor = [254, 243, 199];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Opisyal na Rekord • Kabuuang Bilang: ${rows.length} • Pahina ${data.pageNumber}`,
        32,
        pageHeight - 20
      );
    }
  });

  doc.save(filename);
}

async function buildWordDocument({ title, subtitle, headers, rows, filename, isHighlightRow }) {
  const borderSpec = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
  const cellBorders = { top: borderSpec, bottom: borderSpec, left: borderSpec, right: borderSpec };
  const cellMargins = { top: 90, bottom: 90, left: 110, right: 110 };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((label) => new TableCell({
      borders: cellBorders,
      margins: cellMargins,
      shading: { fill: '1E3A8A', type: ShadingType.CLEAR, color: 'auto' },
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new TextRun({
              text: label,
              bold: true,
              color: 'FFFFFF',
              size: 18,
              font: 'Calibri'
            })
          ]
        })
      ]
    }))
  });

  const bodyRows = rows.map((rowValues, rowIndex) => {
    const highlighted = typeof isHighlightRow === 'function' && isHighlightRow(rowIndex, rowValues);
    const fillHex = highlighted ? 'FEF3C7' : rowIndex % 2 === 1 ? 'F8FAFC' : 'FFFFFF';

    return new TableRow({
      children: rowValues.map((value) => new TableCell({
        borders: cellBorders,
        margins: cellMargins,
        shading: { fill: fillHex, type: ShadingType.CLEAR, color: 'auto' },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: String(value ?? '—'),
                bold: highlighted,
                color: '0F172A',
                size: 18,
                font: 'Calibri'
              })
            ]
          })
        ]
      }))
    });
  });

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE
            },
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720
            }
          }
        },
        children: [
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 32,
                color: '1E3A8A',
                font: 'Calibri'
              })
            ]
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `${subtitle}   •   Nagawa noong: ${formatManilaTimestamp()}`,
                size: 20,
                color: '475569',
                font: 'Calibri'
              })
            ]
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...bodyRows]
          }),
          new Paragraph({
            spacing: { before: 200 },
            children: [
              new TextRun({
                text: `Opisyal na Rekord — Kabuuang Tala: ${rows.length}`,
                italics: true,
                size: 18,
                color: '64748B',
                font: 'Calibri'
              })
            ]
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(document);
  triggerBlobDownload(blob, filename);
}

/**
 * Exports raffle winners to PDF, Word (.docx), or CSV.
 */
export async function exportWinnersReport(format, results = [], options = {}) {
  const {
    campaignName = 'STL Community Rice Raffle',
    batchLabel = 'Kasalukuyang Draw',
    savedAt = null
  } = options;

  const dateTag = (savedAt ? new Date(savedAt) : new Date()).toISOString().slice(0, 10);
  const baseFilename = `${sanitizeFileSlug(campaignName)}-winners-${sanitizeFileSlug(batchLabel)}-${dateTag}`;
  const rows = buildWinnerRows(results);
  const title = `${campaignName} — Opisyal na Listahan ng mga Nanalo`;
  const subtitle = `Batch: ${batchLabel} (${results.length} nanalo)`;
  const isGrandPrizeRow = (_index, rowValues) => String(rowValues?.[1] || '').includes('25 kg');

  if (format === 'pdf') {
    buildPdfDocument({
      title,
      subtitle,
      headers: WINNER_HEADERS,
      rows,
      filename: `${baseFilename}.pdf`,
      isHighlightRow: isGrandPrizeRow
    });
    return;
  }

  if (format === 'docx') {
    await buildWordDocument({
      title,
      subtitle,
      headers: WINNER_HEADERS,
      rows,
      filename: `${baseFilename}.docx`,
      isHighlightRow: isGrandPrizeRow
    });
    return;
  }

  // CSV with UTF-8 BOM so Philippine names/Ñ open cleanly in Microsoft Excel
  const csvLines = [WINNER_HEADERS, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([`\uFEFF${csvLines}`], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, `${baseFilename}.csv`);
}

/**
 * Exports participant entries to PDF or Word (.docx).
 */
export async function exportEntriesReport(format, entries = [], options = {}) {
  const { campaignName = 'STL Community Rice Raffle' } = options;
  const dateTag = new Date().toISOString().slice(0, 10);
  const baseFilename = `${sanitizeFileSlug(campaignName)}-entries-${dateTag}`;
  const rows = buildEntryRows(entries);
  const title = `${campaignName} — Talaan ng mga Kalahok`;
  const subtitle = `Kabuuang Entries: ${entries.length}`;

  if (format === 'pdf') {
    buildPdfDocument({
      title,
      subtitle,
      headers: ENTRY_HEADERS,
      rows,
      filename: `${baseFilename}.pdf`
    });
    return;
  }

  if (format === 'docx') {
    await buildWordDocument({
      title,
      subtitle,
      headers: ENTRY_HEADERS,
      rows,
      filename: `${baseFilename}.docx`
    });
  }
}
