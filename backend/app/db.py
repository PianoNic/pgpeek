import asyncio
import uuid
from typing import Dict, Optional

import asyncpg


class Bookmark:
    def __init__(self, id: str, name: str, url: str):
        self.id = id
        self.name = name
        self.url = url


class ConnectionManager:
    def __init__(self) -> None:
        self.bookmarks: Dict[str, Bookmark] = {}
        self.pools: Dict[str, asyncpg.Pool] = {}
        self._lock = asyncio.Lock()

    def add(self, name: str, url: str, id: Optional[str] = None) -> Bookmark:
        bid = id or str(uuid.uuid4())
        b = Bookmark(bid, name, url)
        self.bookmarks[bid] = b
        return b

    def list(self):
        return list(self.bookmarks.values())

    def get(self, id: str) -> Optional[Bookmark]:
        return self.bookmarks.get(id)

    async def remove(self, id: str) -> None:
        pool = self.pools.pop(id, None)
        if pool:
            await pool.close()
        self.bookmarks.pop(id, None)

    async def pool(self, id: str) -> asyncpg.Pool:
        if id in self.pools:
            return self.pools[id]
        async with self._lock:
            if id in self.pools:
                return self.pools[id]
            bm = self.bookmarks.get(id)
            if not bm:
                raise KeyError(id)
            self.pools[id] = await asyncpg.create_pool(
                bm.url, min_size=1, max_size=5, command_timeout=60
            )
            return self.pools[id]

    async def close_all(self) -> None:
        for p in self.pools.values():
            await p.close()
        self.pools.clear()


manager = ConnectionManager()
