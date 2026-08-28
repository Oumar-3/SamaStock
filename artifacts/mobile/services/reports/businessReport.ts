import * as Print from "expo-print";

import type { DebtWithClient, ProductRecord, SaleRecord, ShopProfile } from "@/models";
import { sharePdfAsync } from "@/services/reports/pdfShare";

export type BusinessReportPeriod = "today" | "month";

type BusinessReportInput = {
  period: BusinessReportPeriod;
  profile: ShopProfile | null | undefined;
  sales: SaleRecord[];
  products: ProductRecord[];
  openDebts: DebtWithClient[];
};

function money(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isSameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameLocalMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function filterSalesByPeriod(sales: SaleRecord[], period: BusinessReportPeriod) {
  const now = new Date();
  return sales.filter(sale => {
    const date = new Date(sale.createdAt);
    if (Number.isNaN(date.getTime())) return false;
    return period === "today" ? isSameLocalDay(date, now) : isSameLocalMonth(date, now);
  });
}

function periodLabel(period: BusinessReportPeriod) {
  const now = new Date();
  if (period === "today") {
    return now.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  }
  return now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function reportTitle(period: BusinessReportPeriod) {
  return period === "today" ? "Rapport du jour" : "Rapport du mois";
}

function buildRows(sales: SaleRecord[]) {
  if (sales.length === 0) {
    return `<tr><td colspan="4" class="empty">Aucune vente sur cette periode.</td></tr>`;
  }
  return sales
    .slice(0, 30)
    .map(sale => {
      const date = new Date(sale.createdAt).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `
        <tr>
          <td><strong>${escapeHtml(sale.receiptNumber)}</strong><span>${escapeHtml(date)}</span></td>
          <td>${sale.paymentType === "credit" ? "Credit" : "Cash"}</td>
          <td>${money(sale.total)}</td>
          <td>${money(sale.estimatedProfit)}</td>
        </tr>
      `;
    })
    .join("");
}

function buildReportHtml(input: BusinessReportInput) {
  const shopName = input.profile?.shopName || "SamaStock";
  const periodSales = filterSalesByPeriod(input.sales, input.period);
  const cashSales = periodSales.filter(sale => sale.paymentType === "cash");
  const creditSales = periodSales.filter(sale => sale.paymentType === "credit");
  const revenue = cashSales.reduce((sum, sale) => sum + sale.total, 0);
  const creditTotal = creditSales.reduce((sum, sale) => sum + sale.total, 0);
  const profit = cashSales.reduce((sum, sale) => sum + sale.estimatedProfit, 0);
  const openDebtTotal = input.openDebts.reduce((sum, debt) => sum + debt.balance, 0);
  const stockValue = input.products.reduce((sum, product) => sum + product.stock * product.buyPrice, 0);
  const lowStock = input.products.filter(product => product.stock <= product.alertThreshold && !product.isArchived);
  const generatedAt = new Date().toLocaleString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #F7F8F5; color: #17211B; font-family: Arial, sans-serif; padding: 24px; }
          .report { max-width: 760px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E3E7DF; border-radius: 18px; overflow: hidden; }
          .hero { background: #12372A; color: #FFFFFF; padding: 28px; }
          .brand { font-size: 12px; opacity: 0.78; margin-bottom: 8px; }
          h1 { margin: 0; font-size: 28px; }
          .period { margin-top: 8px; opacity: 0.82; font-size: 14px; }
          .shop { margin-top: 18px; font-size: 13px; opacity: 0.86; line-height: 1.5; }
          .content { padding: 22px; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 18px; }
          .card { border: 1px solid #E3E7DF; border-radius: 14px; padding: 14px; background: #FBFCFA; }
          .label { color: #667066; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
          .value { font-size: 22px; font-weight: 900; }
          .green { color: #079669; }
          .red { color: #D94A4A; }
          .gold { color: #B7791F; }
          h2 { margin: 20px 0 10px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; border: 1px solid #E3E7DF; border-radius: 14px; overflow: hidden; }
          th { background: #EEF1EC; color: #667066; font-size: 11px; text-align: right; padding: 10px; text-transform: uppercase; }
          th:first-child, td:first-child { text-align: left; }
          td { border-top: 1px solid #EEF1EC; padding: 12px 10px; font-size: 13px; text-align: right; vertical-align: top; }
          td span { display: block; color: #667066; font-size: 11px; margin-top: 3px; }
          .empty { text-align: center !important; color: #667066; padding: 22px; }
          .note { margin-top: 18px; color: #667066; font-size: 12px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <section class="report">
          <div class="hero">
            <div class="brand">SamaStock</div>
            <h1>${reportTitle(input.period)}</h1>
            <div class="period">${escapeHtml(periodLabel(input.period))} - genere le ${escapeHtml(generatedAt)}</div>
            <div class="shop">
              <strong>${escapeHtml(shopName)}</strong><br />
              ${input.profile?.ownerName ? `Gerant: ${escapeHtml(input.profile.ownerName)}<br />` : ""}
              ${input.profile?.phone ? `Tel: ${escapeHtml(input.profile.phone)}<br />` : ""}
              ${input.profile?.address ? `${escapeHtml(input.profile.address)}` : ""}
            </div>
          </div>
          <div class="content">
            <div class="grid">
              <div class="card"><div class="label">Argent encaisse</div><div class="value green">${money(revenue)}</div></div>
              <div class="card"><div class="label">Benefice estime</div><div class="value green">${money(profit)}</div></div>
              <div class="card"><div class="label">Ventes</div><div class="value">${periodSales.length}</div></div>
              <div class="card"><div class="label">Credit vendu</div><div class="value gold">${money(creditTotal)}</div></div>
              <div class="card"><div class="label">Dettes ouvertes</div><div class="value red">${money(openDebtTotal)}</div></div>
              <div class="card"><div class="label">Valeur stock achat</div><div class="value">${money(stockValue)}</div></div>
              <div class="card"><div class="label">Produits</div><div class="value">${input.products.filter(product => !product.isArchived).length}</div></div>
              <div class="card"><div class="label">Stock faible</div><div class="value gold">${lowStock.length}</div></div>
            </div>

            <h2>Ventes de la periode</h2>
            <table>
              <thead><tr><th>Recu</th><th>Paiement</th><th>Total</th><th>Benefice</th></tr></thead>
              <tbody>${buildRows(periodSales)}</tbody>
            </table>

            <p class="note">
              Le credit non rembourse reste comptabilise dans les dettes ouvertes. Le benefice affiche ici est estime a partir des ventes cash de la periode.
            </p>
          </div>
        </section>
      </body>
    </html>
  `;
}

export async function shareBusinessReportPdf(input: BusinessReportInput) {
  const result = await Print.printToFileAsync({
    html: buildReportHtml(input),
    base64: false,
  });

  const title = input.period === "today" ? "Rapport SamaStock du jour" : "Rapport SamaStock du mois";
  if (await sharePdfAsync(result.uri, { dialogTitle: title })) {
    return;
  }

  return result.uri;
}
