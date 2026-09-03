from fastapi import APIRouter, Depends

from vocalize_server.config import Settings, get_settings
from vocalize_server.crawl.crawler import Crawler
from vocalize_server.schemas import CrawlRequest, CrawlResponse

router = APIRouter()


@router.post("/api/crawl", response_model=CrawlResponse)
async def crawl(request: CrawlRequest, settings: Settings = Depends(get_settings)):
    crawler = Crawler(
        user_agent=settings.crawl_user_agent,
        timeout=settings.crawl_timeout_seconds,
        max_pages=request.max_pages or settings.crawl_max_pages,
    )
    pages, skipped = await crawler.crawl(
        start_url=request.url, depth=request.depth, same_domain=request.same_domain
    )
    return CrawlResponse(pages=pages, skipped=skipped)
