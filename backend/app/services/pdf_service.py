"""Branded PDFs (receipt, invoice, daily / stock / employee / anomaly reports).

Cahier fonctionnel §13: every PDF carries the CLIENT company's logo, name and contacts;
KORISE only appears as the generating software (small footer line), never as the owner of the
document. Generated server-side (reportlab) so every client — web, Android, Windows — gets an
identical file."""

import base64
import io
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.business import Business

ACCENT = colors.HexColor("#F85602")
INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#6B7280")
LINE = colors.HexColor("#E4E7EC")
HEAD_BG = colors.HexColor("#F3F4F6")

_styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=_styles["Heading1"], fontName="Helvetica-Bold", fontSize=16, textColor=INK, spaceAfter=2)
H2 = ParagraphStyle("H2", parent=_styles["Heading2"], fontName="Helvetica-Bold", fontSize=11, textColor=INK, spaceBefore=10, spaceAfter=4)
BODY = ParagraphStyle("Body", parent=_styles["BodyText"], fontName="Helvetica", fontSize=9, textColor=INK, leading=12)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=8, textColor=MUTED)
RIGHT = ParagraphStyle("Right", parent=BODY, alignment=TA_RIGHT)

PAYMENT_LABELS = {
    "cash": "Espèces",
    "mobile_money": "Mobile Money",
    "orange_money": "Orange Money",
    "credit": "Crédit",
}
MOVEMENT_LABELS = {
    "sale": "Vente",
    "income": "Entrée",
    "expense": "Dépense",
    "withdrawal": "Retrait",
    "credit_repayment": "Remboursement crédit",
}


def fcfa(n: int | None) -> str:
    if n is None:
        return "—"
    return f"{int(n):,}".replace(",", " ") + " FCFA"


def _dt(d: datetime | date | None) -> str:
    if d is None:
        return "—"
    if isinstance(d, datetime):
        return d.strftime("%d/%m/%Y %H:%M")
    return d.strftime("%d/%m/%Y")


def _logo(business: Business, height: float = 16 * mm):
    if not business.logo_data or "," not in business.logo_data:
        return None
    try:
        raw = base64.b64decode(business.logo_data.split(",", 1)[1])
        img = Image(io.BytesIO(raw))
        ratio = img.imageWidth / float(img.imageHeight or 1)
        img.drawHeight = height
        img.drawWidth = height * ratio
        return img
    except Exception:  # noqa: BLE001 — a broken logo must never block a receipt
        return None


def _header(business: Business, title: str, subtitle: str | None = None) -> list:
    contact = [x for x in (business.address, business.phone, business.email) if x]
    left = [Paragraph(f"<b>{_esc(business.name)}</b>", ParagraphStyle("BN", parent=H1, fontSize=14))]
    if business.sector:
        left.append(Paragraph(_esc(business.sector), SMALL))
    for c in contact:
        left.append(Paragraph(_esc(c), SMALL))
    logo = _logo(business)
    cells = [[logo or "", left]]
    head = Table(cells, colWidths=[(logo.drawWidth + 6 * mm) if logo else 0.1 * mm, None])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    out = [head, Spacer(1, 4 * mm), Paragraph(title, H1)]
    if subtitle:
        out.append(Paragraph(subtitle, SMALL))
    out.append(Spacer(1, 3 * mm))
    return out


def _esc(text: str | None) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _table(data: list[list], col_widths=None, right_cols: tuple[int, ...] = ()) -> Table:
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for c in right_cols:
        style.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def _build(business: Business, story: list, generated_by: str = "") -> bytes:
    buf = io.BytesIO()

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(15 * mm, 9 * mm, f"Document généré avec KORISE{(' — ' + generated_by) if generated_by else ''}")
        canvas.drawRightString(A4[0] - 15 * mm, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
        title=business.name, author=business.name,
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


# ---------------------------------------------------------------- receipt / invoice


def _lines_table(lines: list, first: str) -> tuple[Table, int]:
    rows = [[first, "Qté", "Prix unitaire", "Total"]]
    total = 0
    for product_name, sale in lines:
        rows.append([product_name, str(sale.quantity), fcfa(sale.unit_price), fcfa(sale.total_amount)])
        total += sale.total_amount
    return _table(rows, [None, 20 * mm, 34 * mm, 34 * mm], right_cols=(1, 2, 3)), total


def receipt_pdf(business: Business, lines: list, seller: str, customer_name: str | None) -> bytes:
    """`lines` = [(product_name, Sale), ...] — one basket (several sale lines paid together)."""
    head = lines[0][1]
    ref = str(head.id)[:8].upper()
    story = _header(business, "Reçu de vente", f"N° {ref} — {_dt(head.created_at)}")
    table, total = _lines_table(lines, "Produit")
    story.append(table)
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(f"<b>Total : {fcfa(total)}</b>", ParagraphStyle("T", parent=RIGHT, fontSize=12)))
    story.append(Spacer(1, 3 * mm))
    pay = PAYMENT_LABELS.get(head.payment_method, head.payment_method)
    story.append(Paragraph(f"Paiement : {pay}" + (f" — {_esc(customer_name)}" if customer_name and head.payment_method == "credit" else ""), BODY))
    story.append(Paragraph(f"Vendeur : {_esc(seller)}", BODY))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("Merci de votre confiance.", SMALL))
    return _build(business, story)


def invoice_pdf(business: Business, lines: list, seller: str, customer) -> bytes:
    head = lines[0][1]
    ref = str(head.id)[:8].upper()
    story = _header(business, "Facture", f"Référence F-{ref} — {_dt(head.created_at)}")
    if customer is not None:
        story.append(Paragraph("<b>Facturé à</b>", H2))
        story.append(Paragraph(_esc(customer.full_name) + (f" — {_esc(customer.phone)}" if customer.phone else ""), BODY))
        story.append(Spacer(1, 2 * mm))
    table, total = _lines_table(lines, "Désignation")
    story.append(table)
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(f"<b>Total à payer : {fcfa(total)}</b>", ParagraphStyle("T", parent=RIGHT, fontSize=12)))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(f"Mode de paiement : {PAYMENT_LABELS.get(head.payment_method, head.payment_method)}", BODY))
    story.append(Paragraph(f"Vendeur : {_esc(seller)}", BODY))
    return _build(business, story)


# ---------------------------------------------------------------- reports


def _kpis(pairs: list[tuple[str, str]]) -> Table:
    data = [[Paragraph(f"<font color='#6B7280' size=7>{_esc(k.upper())}</font><br/><b>{_esc(v)}</b>", BODY) for k, v in pairs]]
    t = Table(data, colWidths=[(A4[0] - 30 * mm) / len(pairs)] * len(pairs))
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t


def _breakdown(title: str, items: list[dict], with_count: bool = True) -> list:
    if not items:
        return []
    rows = [[title, "Ventes", "Total"] if with_count else [title, "Total"]]
    for it in items:
        label = PAYMENT_LABELS.get(it["key"], it["key"])
        rows.append([label, str(it["count"]), fcfa(it["total"])] if with_count else [label, fcfa(it["total"])])
    return [_table(rows, right_cols=(1, 2) if with_count else (1,)), Spacer(1, 3 * mm)]


def daily_report_pdf(business: Business, day: date, data: dict) -> bytes:
    story = _header(business, "Rapport journalier", f"Journée du {_dt(day)}")
    story.append(
        _kpis(
            [
                ("Ventes", fcfa(data["sales_total"])),
                ("Nb ventes", str(data["sales_count"])),
                ("Dépenses", fcfa(data["expenses_total"])),
                ("Crédits accordés", fcfa(data["credit_granted"])),
            ]
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("Encaissements par moyen de paiement", H2))
    story += _breakdown("Moyen", data["by_payment"]) or [Paragraph("Aucune vente.", SMALL)]
    if data["expenses_by_category"]:
        story.append(Paragraph("Dépenses par catégorie", H2))
        story.append(_table([["Catégorie", "Total"]] + [[e["key"], fcfa(e["total"])] for e in data["expenses_by_category"]], right_cols=(1,)))
    story.append(Paragraph("Caisse attendue et réelle", H2))
    c = data.get("closing")
    if c is None:
        story.append(Paragraph("Aucune clôture enregistrée pour cette journée.", SMALL))
    else:
        rows = [["Canal", "Attendu", "Compté", "Écart"], ["Espèces", fcfa(c.expected_cash), fcfa(c.actual_cash), fcfa(c.difference)]]
        if c.expected_momo is not None:
            rows.append(["Mobile Money", fcfa(c.expected_momo), fcfa(c.actual_momo), fcfa(c.difference_momo)])
        if c.expected_orange is not None:
            rows.append(["Orange Money", fcfa(c.expected_orange), fcfa(c.actual_orange), fcfa(c.difference_orange)])
        story.append(_table(rows, right_cols=(1, 2, 3)))
        if c.note:
            story.append(Paragraph(f"Motif : {_esc(c.note)}", SMALL))
    story.append(Paragraph("Activité des employés", H2))
    story += _breakdown("Employé", data["by_employee"]) or [Paragraph("Aucune activité.", SMALL)]
    if data["shifts"]:
        story.append(Paragraph("Shifts", H2))
        rows = [["Employé", "Ouverture", "Fermeture", "Fond", "Compté", "Écart"]]
        for sh, name in data["shifts"]:
            rows.append([name, _dt(sh.opened_at), _dt(sh.closed_at), fcfa(sh.opening_cash), fcfa(sh.counted_cash), fcfa(sh.difference)])
        story.append(_table(rows, right_cols=(3, 4, 5)))
    if data.get("estimated_profit") is not None:
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph(f"Bénéfice estimé (ventes - coût d'achat - dépenses) : <b>{fcfa(data['estimated_profit'])}</b>", BODY))
    return _build(business, story)


def stock_report_pdf(business: Business, rows_data: list[dict], with_costs: bool) -> bytes:
    story = _header(business, "Rapport de stock", f"État au {_dt(datetime.utcnow())}")
    alerts = [r for r in rows_data if r["alert"]]
    story.append(_kpis([("Produits actifs", str(len(rows_data))), ("En alerte", str(len(alerts))),
                        ("Valeur du stock", fcfa(sum(r["value"] or 0 for r in rows_data)) if with_costs else "—")]))
    story.append(Spacer(1, 3 * mm))
    header = ["Produit", "Stock", "Seuil", "Prix vente", "Mouv. 30j"] + (["Valeur"] if with_costs else [])
    rows = [header]
    for r in rows_data:
        name = r["name"] + (" (alerte)" if r["alert"] else "")
        line = [name, str(r["quantity"]), str(r["minimum_stock"]), fcfa(r["selling_price"]), str(r["movements_30d"])]
        if with_costs:
            line.append(fcfa(r["value"]))
        rows.append(line)
    story.append(_table(rows, right_cols=tuple(range(1, len(header)))))
    return _build(business, story)


def employee_report_pdf(business: Business, date_from: date, date_to: date, data: dict) -> bytes:
    user = data["user"]
    story = _header(business, f"Rapport employé — {_esc(user.full_name) if user else ''}", f"Du {_dt(date_from)} au {_dt(date_to)}")
    story.append(_kpis([("Ventes", fcfa(data["sales_total"])), ("Nb ventes", str(data["sales_count"])),
                        ("Dépenses saisies", fcfa(data["expenses_total"])), ("Crédits accordés", fcfa(data["credit_granted"]))]))
    story.append(Paragraph("Ventes par moyen de paiement", H2))
    story += _breakdown("Moyen", data["by_payment"]) or [Paragraph("Aucune vente.", SMALL)]
    story.append(Paragraph("Shifts", H2))
    if data["shifts"]:
        rows = [["Ouverture", "Fermeture", "Fond", "Attendu", "Compté", "Écart"]]
        for sh in data["shifts"]:
            rows.append([_dt(sh.opened_at), _dt(sh.closed_at), fcfa(sh.opening_cash), fcfa(sh.expected_cash), fcfa(sh.counted_cash), fcfa(sh.difference)])
        story.append(_table(rows, right_cols=(2, 3, 4, 5)))
    else:
        story.append(Paragraph("Aucun shift sur la période.", SMALL))
    story.append(Paragraph("Clôtures de journée", H2))
    if data["closings"]:
        rows = [["Jour", "Écart espèces", "Écart MoMo", "Écart Orange"]]
        for c in data["closings"]:
            rows.append([_dt(c.closing_date), fcfa(c.difference), fcfa(c.difference_momo), fcfa(c.difference_orange)])
        story.append(_table(rows, right_cols=(1, 2, 3)))
    else:
        story.append(Paragraph("Aucune clôture sur la période.", SMALL))
    return _build(business, story)


def anomalies_report_pdf(business: Business, anomalies: list) -> bytes:
    story = _header(business, "Rapport des anomalies", f"Édité le {_dt(datetime.utcnow())}")
    open_count = sum(1 for a in anomalies if a.status == "open")
    story.append(_kpis([("Anomalies", str(len(anomalies))), ("À traiter", str(open_count)), ("Résolues", str(len(anomalies) - open_count))]))
    story.append(Spacer(1, 3 * mm))
    if not anomalies:
        story.append(Paragraph("Aucune anomalie sur la période.", SMALL))
    else:
        rows = [["Date", "Anomalie", "Montant", "Utilisateur", "Statut"]]
        for a in anomalies:
            rows.append([
                Paragraph(_dt(a.date), BODY),
                Paragraph(_esc(a.label) + (f"<br/><font size=7 color='#6B7280'>{_esc(a.probable_cause)}</font>" if a.probable_cause else ""), BODY),
                fcfa(a.amount) if a.kind != "stock_adjustment" else f"{a.amount} u.",
                _esc(a.user_name or "—"),
                "Résolue" if a.status == "resolved" else "À traiter",
            ])
        story.append(_table(rows, [24 * mm, None, 28 * mm, 30 * mm, 20 * mm], right_cols=(2,)))
    return _build(business, story)
