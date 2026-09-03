from urllib.parse import urljoin, urlparse

import httpx
import trafilatura

from vocalize_server.crawl.robots import RobotsCache
from vocalize_server.schemas import CrawlResult


class Crawler:
    def __init__(self, user_agent: str, timeout: float, max_pages: int):
        self._user_agent = user_agent
        self._timeout = timeout
        self._max_pages = max_pages
        self._robots = RobotsCache(user_agent=user_agent, timeout=timeout)

    async def crawl(
        self, start_url: str, depth: int, same_domain: bool
    ) -> tuple[list[CrawlResult], list[str]]:
        max_pages = self._max_pages
        visited: set[str] = set()
        skipped: list[str] = []
        results: list[CrawlResult] = []
        frontier: list[tuple[str, int]] = [(start_url, 0)]
        start_domain = urlparse(start_url).netloc

        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
            while frontier and len(results) < max_pages:
                url, level = frontier.pop(0)
                if url in visited:
                    continue
                visited.add(url)

                if not await self._robots.can_fetch(url):
                    skipped.append(url)
                    continue

                try:
                    response = await client.get(url, headers={"User-Agent": self._user_agent})
                    response.raise_for_status()
                except httpx.HTTPError:
                    skipped.append(url)
                    continue

                html = response.text
                text = trafilatura.extract(html) or ""
                metadata = trafilatura.extract_metadata(html)
                title = metadata.title if metadata else None
                if text:
                    results.append(CrawlResult(url=url, title=title, text=text))

                if level < depth:
                    for link in _extract_links(html, url):
                        if same_domain and urlparse(link).netloc != start_domain:
                            continue
                        if link not in visited:
                            frontier.append((link, level + 1))

        return results, skipped


def _extract_links(html: str, base_url: str) -> list[str]:
    import re

    hrefs = re.findall(r'href=["\']([^"\']+)["\']', html)
    links = []
    for href in hrefs:
        if href.startswith("#") or href.startswith("mailto:") or href.startswith("javascript:"):
            continue
        links.append(urljoin(base_url, href))
    return links
