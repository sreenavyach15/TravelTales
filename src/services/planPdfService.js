import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function formatCurrency(value) {
  return Number(value || 0).toFixed(2)
}

function createFileName(destination) {
  const safeDestination = (destination || 'trip')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const date = new Date().toISOString().split('T')[0]
  return `${safeDestination || 'trip'}-itinerary-${date}.pdf`
}

function addWrappedParagraph(doc, text, x, y, maxWidth, lineHeight = 14) {
  const lines = doc.splitTextToSize(text || '-', maxWidth)
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

export function downloadItineraryPdf({ trip, itinerary }) {
  if (!itinerary?.days?.length) {
    throw new Error('No itinerary data available for download.')
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - margin * 2
  let cursorY = margin

  doc.setFontSize(22)
  doc.text('Travel Plan', margin, cursorY)
  cursorY += 24

  doc.setFontSize(12)
  doc.setTextColor(80)
  doc.text(`Destination: ${itinerary.destination || trip?.destination || 'Not set'}`, margin, cursorY)
  cursorY += 16
  doc.text(`Trip Dates: ${trip?.startDate || 'N/A'} to ${trip?.endDate || 'N/A'}`, margin, cursorY)
  cursorY += 16
  doc.text(`Budget Limit: ${formatCurrency(itinerary.budgetLimit)}`, margin, cursorY)
  cursorY += 16
  doc.text(`Planned Total: ${formatCurrency(itinerary.plannedBudget)}`, margin, cursorY)
  cursorY += 24
  doc.setTextColor(0)

  autoTable(doc, {
    startY: cursorY,
    head: [['Summary', 'Amount']],
    body: [
      ['Place Budgets', formatCurrency(itinerary.totalEstimatedBudget)],
      ['Travel Fares', formatCurrency(itinerary.totalTravelFare)],
      ['Grand Total', formatCurrency(itinerary.plannedBudget)],
    ],
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [15, 23, 42] },
    margin: { left: margin, right: margin },
  })

  cursorY = doc.lastAutoTable.finalY + 24

  itinerary.days.forEach((day) => {
    if (cursorY > pageHeight - 220) {
      doc.addPage()
      cursorY = margin
    }

    doc.setFontSize(16)
    doc.text(`Day ${day.dayNumber}  |  ${day.date || 'Date not set'}`, margin, cursorY)
    cursorY += 18

    doc.setFontSize(11)
    doc.text(`Day Total Budget: ${formatCurrency(day.totalDayBudget)}`, margin, cursorY)
    cursorY += 14

    autoTable(doc, {
      startY: cursorY + 6,
      head: [['Stop', 'Place', 'Time', 'Travel Mode', 'Fare', 'Place Budget']],
      body: day.places.map((place, index) => [
        `${index + 1}`,
        place.name || '-',
        place.estimatedTime || '-',
        place.travelModeFromPrevious || '-',
        formatCurrency(place.travelFare),
        formatCurrency(place.estimatedBudget),
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [51, 65, 85] },
      margin: { left: margin, right: margin },
      theme: 'striped',
    })

    cursorY = doc.lastAutoTable.finalY + 14

    day.places.forEach((place, index) => {
      if (cursorY > pageHeight - 150) {
        doc.addPage()
        cursorY = margin
      }

      doc.setFontSize(12)
      doc.text(`Stop ${index + 1}: ${place.name || '-'}`, margin, cursorY)
      cursorY += 14

      doc.setFontSize(10)
      cursorY = addWrappedParagraph(
        doc,
        `Activities: ${place.activities || '-'}`,
        margin,
        cursorY,
        contentWidth,
      )
      cursorY += 4
      cursorY = addWrappedParagraph(
        doc,
        `Things to Try: ${place.thingsToTry || '-'}`,
        margin,
        cursorY,
        contentWidth,
      )
      cursorY += 4
      cursorY = addWrappedParagraph(
        doc,
        `Description: ${place.description || '-'}`,
        margin,
        cursorY,
        contentWidth,
      )
      cursorY += 12
    })

    cursorY += 8
  })

  doc.save(createFileName(itinerary.destination || trip?.destination))
}
