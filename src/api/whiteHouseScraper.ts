import * as cheerio from 'cheerio';
import type { ExecutiveOrder } from '../types';

export async function scrapeWhiteHouseOrders(): Promise<Partial<ExecutiveOrder>[]> {
  const url = 'https://www.whitehouse.gov/briefing-room/presidential-actions/';
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const orders: Partial<ExecutiveOrder>[] = [];

    // Try multiple possible selectors as the site structure might vary
    const possibleArticleSelectors = [
      '.archive-content article',
      '.presidential-actions article',
      'article.briefing-statement',
      '.entry-content article'
    ];

    for (const selector of possibleArticleSelectors) {
      $(selector).each((_, element) => {
        const $element = $(element);
        const title = $element.find('.archive-title, .entry-title, h2, h3').first().text().trim();
        
        if (title.toLowerCase().includes('executive order')) {
          const link = $element.find('a').first();
          const url = link.attr('href') || '';
          const dateText = $element.find('time, .entry-date, .post-date').first().text().trim();
          const date = dateText ? new Date(dateText).toISOString() : new Date().toISOString();

          // Extract EO number if present
          const numberMatch = title.toLowerCase().match(/executive order (?:number )?(\d+)/);
          const number = numberMatch ? numberMatch[1] : '';

          // Get summary if available
          const summary = $element.find('.archive-description, .entry-content, .post-excerpt')
            .first()
            .text()
            .trim() || title;

          if (number) {
            orders.push({
              number,
              title,
              date,
              url,
              summary,
              status: 'active'
            });
          }
        }
      });

      // If we found any orders, break the loop
      if (orders.length > 0) break;
    }

    console.log(`Successfully scraped ${orders.length} orders from White House website`);
    return orders;
  } catch (error) {
    console.error('Error scraping White House website:', error);
    return [];
  }
}