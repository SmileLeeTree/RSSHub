import { load } from 'cheerio';
import type { Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/rsrm/:page?',
    categories: ['government'],
    view: ViewType.Articles,
    example: '/shanghang/rsrm',
    parameters: {
        page: {
            description: '页码，默认获取最新一页',
            default: '1',
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['www.shanghang.gov.cn/zwgk/rsxx/rsrm/'],
            target: '/rsrm',
        },
    ],
    name: '人事任免',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const baseUrl = 'https://www.shanghang.gov.cn';
    const page = ctx.req.param('page') || '1';
    const listUrl =
        page === '1'
            ? `${baseUrl}/zwgk/rsxx/rsrm/`
            : `${baseUrl}/zwgk/rsxx/rsrm/index_${page}.htm`;

    const { data: response } = await got(listUrl);
    const $ = load(response);

    const pageTitle = $('title').text().trim();

    const list = $('div.list_base ul li')
        .toArray()
        .map((item) => {
            const $item = $(item);
            const $a = $item.find('a');
            const href = $a.attr('href') || '';
            const title = $a.attr('title') || $a.text().trim();
            const link = href.startsWith('http') ? href : new URL(href, listUrl).href;
            const pubDateStr = $item.find('span').text().trim();
            return { title, link, pubDate: pubDateStr ? parseDate(pubDateStr) : undefined };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    const { data: detailResponse } = await got(item.link);
                    const $detail = load(detailResponse);
                    const contentEl = $detail('div.TRS_Editor');
                    if (contentEl.length) {
                        contentEl.find('style').remove();
                        item.description = contentEl.html() || '';
                    } else {
                        const fallbackEl = $detail('div.article_content');
                        if (fallbackEl.length) {
                            item.description = fallbackEl.html() || '';
                        }
                    }
                    const detailPubDate = $detail('meta[name="PubDate"]').attr('content');
                    if (detailPubDate) {
                        item.pubDate = parseDate(detailPubDate);
                    }
                    return item;
                } catch {
                    return item;
                }
            })
        )
    );

    return {
        title: pageTitle || '人事任免 - 上杭县人民政府',
        link: listUrl,
        description: '上杭县人民政府 - 人事任免信息',
        language: 'zh-CN',
        item: items,
    };
}
