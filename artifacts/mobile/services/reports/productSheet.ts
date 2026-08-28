import * as Print from "expo-print";

import type { ProductRecord, ShopProfile } from "@/models";
import { sharePdfAsync } from "@/services/reports/pdfShare";

type ProductSheetInput = {
  profile: ShopProfile | null | undefined;
  products: ProductRecord[];
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

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function buildRows(products: ProductRecord[]) {
  if (products.length === 0) {
    return `<tr><td colspan="8" class="empty">Aucun produit enregistre.</td></tr>`;
  }

  return products
    .filter(product => !product.isArchived)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(product => {
      const lowStock = product.stock <= product.alertThreshold;
      return `
        <tr>
          <td><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.barcode || "-")}</span></td>
          <td>${escapeHtml(product.category || "-")}</td>
          <td>${escapeHtml(product.brand || "-")}</td>
          <td>${escapeHtml(product.format || "-")}</td>
          <td>${money(product.buyPrice)}</td>
          <td>${money(product.sellPrice)}</td>
          <td class="${lowStock ? "danger" : ""}">${product.stock}</td>
          <td>${dateLabel(product.createdAt)}</td>
        </tr>
      `;
    })
    .join("");
}

function buildProductSheetHtml(input: ProductSheetInput) {
  const activeProducts = input.products.filter(product => !product.isArchived);
  const lowStockCount = activeProducts.filter(product => product.stock <= product.alertThreshold).length;
  const stockValue = activeProducts.reduce((sum, product) => sum + product.stock * product.buyPrice, 0);
  const shopName = input.profile?.shopName || "SamaStock";
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
          body { margin: 0; background: #F7F8F5; color: #17211B; font-family: Arial, sans-serif; padding: 20px; }
          .sheet { max-width: 980px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E3E7DF; border-radius: 18px; overflow: hidden; }
          .hero { background: #12372A; color: #FFFFFF; padding: 26px; }
          .brand { font-size: 12px; opacity: 0.78; margin-bottom: 8px; }
          h1 { margin: 0; font-size: 28px; }
          .meta { margin-top: 10px; opacity: 0.86; font-size: 13px; line-height: 1.5; }
          .content { padding: 20px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
          .card { border: 1px solid #E3E7DF; border-radius: 14px; padding: 14px; background: #FBFCFA; }
          .label { color: #667066; font-size: 11px; text-transform: uppercase; margin-bottom: 6px; }
          .value { font-size: 22px; font-weight: 900; }
          .green { color: #079669; }
          .gold { color: #B7791F; }
          table { width: 100%; border-collapse: collapse; border: 1px solid #E3E7DF; border-radius: 14px; overflow: hidden; }
          th { background: #EEF1EC; color: #667066; font-size: 10px; text-align: right; padding: 9px 8px; text-transform: uppercase; }
          th:first-child, td:first-child { text-align: left; }
          td { border-top: 1px solid #EEF1EC; padding: 10px 8px; font-size: 12px; text-align: right; vertical-align: top; }
          td span { display: block; color: #667066; font-size: 10px; margin-top: 3px; }
          .danger { color: #D94A4A; font-weight: 800; }
          .empty { text-align: center !important; color: #667066; padding: 22px; }
          .note { margin-top: 16px; color: #667066; font-size: 12px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <section class="sheet">
          <div class="hero">
            <div class="brand">SamaStock</div>
            <h1>Fiche produits</h1>
            <div class="meta">
              <strong>${escapeHtml(shopName)}</strong><br />
              ${input.profile?.ownerName ? `Gerant: ${escapeHtml(input.profile.ownerName)}<br />` : ""}
              ${input.profile?.phone ? `Tel: ${escapeHtml(input.profile.phone)}<br />` : ""}
              Genere le ${escapeHtml(generatedAt)}
            </div>
          </div>
          <div class="content">
            <div class="grid">
              <div class="card"><div class="label">Produits actifs</div><div class="value green">${activeProducts.length}</div></div>
              <div class="card"><div class="label">Stock faible</div><div class="value gold">${lowStockCount}</div></div>
              <div class="card"><div class="label">Valeur stock achat</div><div class="value">${money(stockValue)}</div></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Produit / Code</th>
                  <th>Categorie</th>
                  <th>Marque</th>
                  <th>Format</th>
                  <th>Prix achat</th>
                  <th>Prix vente</th>
                  <th>Stock</th>
                  <th>Date ajout</th>
                </tr>
              </thead>
              <tbody>${buildRows(activeProducts)}</tbody>
            </table>
            <p class="note">Cette fiche sert de reference simple pour verifier les produits enregistres, les prix et le stock disponible.</p>
          </div>
        </section>
      </body>
    </html>
  `;
}

export async function shareProductSheetPdf(input: ProductSheetInput) {
  const result = await Print.printToFileAsync({
    html: buildProductSheetHtml(input),
    base64: false,
  });

  if (await sharePdfAsync(result.uri, { dialogTitle: "Fiche produits SamaStock" })) {
    return;
  }

  return result.uri;
}
