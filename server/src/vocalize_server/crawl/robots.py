from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx


class RobotsCache:
    """Fetches and caches robots.txt per-origin, checking fetch permission."""

    def __init__(self, user_agent: str, timeout: float = 10.0):
        self._user_agent = user_agent
        self._timeout = timeout
        self._parsers: dict[str, RobotFileParser] = {}

    async def _get_parser(self, url: str) -> RobotFileParser:
        origin = _origin_of(url)
        if origin in self._parsers:
            return self._parsers[origin]

        parser = RobotFileParser()
        robots_url = urljoin(origin, "/robots.txt")
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(robots_url, headers={"User-Agent": self._user_agent})
            if response.status_code == 200:
                parser.parse(response.text.splitlines())
            else:
                # No robots.txt (or unreachable) => treat as allow-all.
                parser.parse([])
        except httpx.HTTPError:
            parser.parse([])

        self._parsers[origin] = parser
        return parser

    async def can_fetch(self, url: str) -> bool:
        parser = await self._get_parser(url)
        return parser.can_fetch(self._user_agent, url)


def _origin_of(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"
