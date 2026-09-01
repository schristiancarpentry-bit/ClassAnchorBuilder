/* ClassAnchor Feedback Builder — Word (.docx) export
 * Uses the vendored docx.js (window.docx, iife build) — see vendor/docx.iife.js.
 */
(function () {
  "use strict";

  var COLOR = {
    ink: "16211F",
    brass: "9C6B22",
    steel: "3C5960",
    soft: "5B6664",
    line: "D8D3C8",
    band: {
      "not-met": "B23A34",
      developing: "C07A1F",
      meeting: "3C5960",
      exceeding: "3F7D52"
    }
  };

  function fmtDate(d) {
    d = d || new Date();
    var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  function safeFilePart(s) {
    return String(s || "").replace(/[\\/:*?"<>|]+/g, "").trim();
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function buildTabSection(docx, tab, libMap, summaryText, tabTitle) {
    var Paragraph = docx.Paragraph, TextRun = docx.TextRun, HeadingLevel = docx.HeadingLevel,
        Table = docx.Table, TableRow = docx.TableRow, TableCell = docx.TableCell,
        WidthType = docx.WidthType, ShadingType = docx.ShadingType, AlignmentType = docx.AlignmentType,
        BorderStyle = docx.BorderStyle;

    function cellBorders() {
      var b = { style: BorderStyle.SINGLE, size: 2, color: COLOR.line };
      return { top: b, bottom: b, left: b, right: b };
    }

    function headerCell(text, width) {
      return new TableCell({
        width: { size: width, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F2EFE7" },
        borders: cellBorders(),
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: text, bold: true, size: 18, color: COLOR.ink })] })]
      });
    }
    function valueCell(text, width) {
      return new TableCell({
        width: { size: width, type: WidthType.PERCENTAGE },
        borders: cellBorders(),
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: text || "—", size: 20 })] })]
      });
    }

    var detailsTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [headerCell("Student Name", 25), valueCell(tab.student.name, 25), headerCell("Group", 25), valueCell(tab.student.group, 25)] }),
        new TableRow({ children: [headerCell("Level", 25), valueCell(tab.student.level, 25), headerCell("Unit Reference", 25), valueCell(tab.student.unit, 25)] }),
        new TableRow({ children: [headerCell("Date", 25), valueCell(fmtDate(), 25), headerCell("Criteria Assessed", 25), valueCell(String(tab.sliders.length), 25)] })
      ]
    });

    var children = [];

    children.push(new Paragraph({
      children: [new TextRun({ text: "ClassAnchor Feedback Builder", bold: true, size: 18, color: COLOR.brass, allCaps: true, characterSpacing: 10 })],
      spacing: { after: 60 }
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: "Practical Assessment Feedback", bold: true, size: 40, color: COLOR.ink })],
      spacing: { after: 40 }
    }));
    if (tabTitle) {
      children.push(new Paragraph({
        children: [new TextRun({ text: tabTitle, italics: true, size: 20, color: COLOR.soft })],
        spacing: { after: 200 }
      }));
    }
    children.push(detailsTable);
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

    // Criteria, grouped by category
    if (tab.sliders.length) {
      children.push(new Paragraph({
        children: [new TextRun({ text: "Assessment Criteria", bold: true, size: 26, color: COLOR.steel })],
        spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.line } }
      }));

      var byCat = {};
      var order = [];
      tab.sliders.forEach(function (inst) {
        var s = libMap[inst.libId];
        var catId = s ? s.category : "custom";
        var catName = (window.FeedbackData.CATEGORIES.filter(function (c) { return c.id === catId; })[0] || { name: "Other" }).name;
        if (!byCat[catId]) { byCat[catId] = { name: catName, items: [] }; order.push(catId); }
        byCat[catId].items.push(inst);
      });

      order.forEach(function (catId) {
        var group = byCat[catId];
        children.push(new Paragraph({
          children: [new TextRun({ text: group.name, bold: true, size: 22, color: COLOR.ink })],
          spacing: { before: 160, after: 80 }
        }));

        var rows = [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell("Criterion", 34),
              headerCell("Score", 12),
              headerCell("Rating", 18),
              headerCell("Feedback", 36)
            ]
          })
        ];

        group.items.forEach(function (inst) {
          var s = libMap[inst.libId];
          var tier = window.FeedbackData.tierFor(inst.value);
          var text = window.FeedbackApp.textForInstance(inst, s, tab.student.name);
          rows.push(new TableRow({ children: [
            new TableCell({ width: { size: 34, type: WidthType.PERCENTAGE }, borders: cellBorders(), margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: s ? s.name : "(removed slider)", bold: true, size: 20 })] })] }),
            new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, borders: cellBorders(), margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: inst.value + " / 10", bold: true, size: 20 })] })] }),
            new TableCell({ width: { size: 18, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: COLOR.band[tier.band] }, borders: cellBorders(), margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: tier.label, bold: true, size: 18, color: "FFFFFF" })] })] }),
            new TableCell({ width: { size: 36, type: WidthType.PERCENTAGE }, borders: cellBorders(), margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: text, size: 19 })] })] })
          ]}));
        });

        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows }));
      });
    }

    // Summary
    children.push(new Paragraph({
      children: [new TextRun({ text: "Summary of Performance", bold: true, size: 26, color: COLOR.steel })],
      spacing: { before: 280, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.line } }
    }));
    children.push(new Paragraph({
      shading: { type: ShadingType.CLEAR, color: "auto", fill: "F7F5F0" },
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: COLOR.line }, bottom: { style: BorderStyle.SINGLE, size: 2, color: COLOR.line }, left: { style: BorderStyle.SINGLE, size: 2, color: COLOR.line }, right: { style: BorderStyle.SINGLE, size: 2, color: COLOR.line } },
      spacing: { after: 260 },
      children: [new TextRun({ text: summaryText, size: 21 })]
    }));

    // Notes
    children.push(new Paragraph({
      children: [new TextRun({ text: "Additional Notes", bold: true, size: 26, color: COLOR.steel })],
      spacing: { before: 120, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.line } }
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: tab.notes && tab.notes.trim() ? tab.notes : "No additional notes recorded.", size: 21, italics: !(tab.notes && tab.notes.trim()) })],
      spacing: { after: 240 }
    }));

    children.push(new Paragraph({
      children: [new TextRun({ text: "Generated by ClassAnchor Feedback Builder on " + fmtDate(), size: 16, color: COLOR.soft, italics: true })]
    }));

    return children;
  }

  // Broadcasts to every status indicator on the page (there's one by each set
  // of export buttons — top and bottom — so whichever one the tutor used
  // shows the result without needing to scroll to the other).
  function withStatus(msg, isError) {
    document.querySelectorAll(".export-status").forEach(function (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = msg;
      statusEl.className = "export-status" + (isError ? " error" : "");
    });
  }

  function exportTab(tab, libMap, buildSummary) {
    var docx = window.docx;
    if (!docx) { withStatus("Word export library failed to load.", true); return; }
    withStatus("Building Word document…", false);
    var summary = buildSummary(tab);
    try {
      var doc = new docx.Document({
        creator: "ClassAnchor Feedback Builder",
        title: "Practical Assessment Feedback",
        sections: [{ children: buildTabSection(docx, tab, libMap, summary, null) }]
      });
      docx.Packer.toBlob(doc).then(function (blob) {
        var name = safeFilePart(tab.student.name || "Assessment") + " - Feedback.docx";
        downloadBlob(blob, name);
        withStatus("Downloaded " + name, false);
      }).catch(function (err) {
        console.error(err);
        withStatus("Could not build the Word document: " + err.message, true);
      });
    } catch (err) {
      console.error(err);
      withStatus("Could not build the Word document: " + err.message, true);
    }
  }

  function exportAllTabs(tabs, libMap, buildSummary, titleFn) {
    var docx = window.docx;
    if (!docx) { withStatus("Word export library failed to load.", true); return; }
    withStatus("Building combined Word document…", false);
    try {
      var sections = tabs.map(function (tab, i) {
        var summary = buildSummary(tab);
        return { children: buildTabSection(docx, tab, libMap, summary, titleFn(tab, i)) };
      });
      var doc = new docx.Document({
        creator: "ClassAnchor Feedback Builder",
        title: "Practical Assessment Feedback — All Students",
        sections: sections
      });
      docx.Packer.toBlob(doc).then(function (blob) {
        var name = "Feedback - All Students.docx";
        downloadBlob(blob, name);
        withStatus("Downloaded " + name, false);
      }).catch(function (err) {
        console.error(err);
        withStatus("Could not build the Word document: " + err.message, true);
      });
    } catch (err) {
      console.error(err);
      withStatus("Could not build the Word document: " + err.message, true);
    }
  }

  window.FeedbackExport = { exportTab: exportTab, exportAllTabs: exportAllTabs };
})();
