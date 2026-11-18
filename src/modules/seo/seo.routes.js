const express = require('express');
const Product = require('../products/product.model');

/**
 * Crawler-friendly product pages. nginx sends link-preview bots (WhatsApp, Facebook, Google...)
 * for /product/:id here; we return the SPA shell with product-specific title / OG tags / JSON-LD.
 * Real visitors never hit this route.
 */
const router = express.Router();

const SITE = (process.env.STORE_URL || 'https://m20fragrance.store').replace(/\/+$/, '');
const SHELL_TTL_MS = 5 * 60 * 1000;
let shellCache = { html: '', at: 0 };

const esc = (v = '') =>
  String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const absUrl = (u = '') => (!u ? '' : /^https?:\/\//i.test(u) ? u : `${SITE}${u.startsWith('/') ? '' : '/'}${u}`);

async function getShell() {
  if (shellCache.html && Date.now() - shellCache.at < SHELL_TTL_MS) return shellCache.html;
  const res = await fetch(`${SITE}/index.html`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`shell ${res.status}`);
  shellCache = { html: await res.text(), at: Date.now() };
  return shellCache.html;
}

const setMeta = (html, attr, name, content) => {
  const tag = `<meta ${attr}="${name}" content="${esc(content)}" />`;
  const re = new RegExp(String.raw`<meta\s+${attr}="${name}"\s+content="[^"]*"\s*/?>`, 'i');
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
};

router.get('/product/:id', async (req, res) => {
  let html;
  try {
    html = await getShell();
  } catch {
    return res.status(502).type('text/plain').send('Store shell unavailable');
  }

  try {
    const id = String(req.params.id || '').trim().toLowerCase();
    const product = await Product.findOne({ slug: id, active: true }).lean();

    if (product) {
      const url = `${SITE}/product/${product.slug}`;
      const title = `${product.name} • Extrait de Parfum | M20 Haute Parfumerie`;
      const desc = (product.shortDescription || product.description || `Buy ${product.name} online from M20 Fine Fragrances. Fast delivery across Egypt.`)
        .replace(/\s+/g, ' ').trim().slice(0, 300);
      const img = absUrl(product.mainImage?.url || product.images?.[0]?.url || '/img/hero.png');
      const price = Math.round(Number(product.variants?.[0]?.price || 0));

      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
      html = setMeta(html, 'name', 'description', desc);
      html = setMeta(html, 'property', 'og:title', title);
      html = setMeta(html, 'property', 'og:description', desc);
      html = setMeta(html, 'property', 'og:image', img);
      html = setMeta(html, 'property', 'og:url', url);
      html = setMeta(html, 'property', 'og:type', 'product');
      html = setMeta(html, 'name', 'twitter:title', title);
      html = setMeta(html, 'name', 'twitter:description', desc);
      html = setMeta(html, 'name', 'twitter:image', img);
      html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(url)}" />`);

      const ld = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        url,
        image: [img],
        description: desc,
        sku: product.variants?.[0]?.SKU || product.slug,
        brand: { '@type': 'Brand', name: 'M20' },
        offers: {
          '@type': 'Offer',
          url,
          priceCurrency: 'EGP',
          price,
          availability: 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/NewCondition'
        }
      };
      html = html.replace(
        '</head>',
        `    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n  </head>`
      );
    }
  } catch (err) {
    // Fall through: serve the plain shell rather than failing a crawler
  }

  res.set('Cache-Control', 'public, max-age=300').type('html').send(html);
});

module.exports = router;
