import asyncio
from typing import Any

Event = dict[str, Any]


class EventBus:
    """In-memory fan-out of job progress events to connected WebSocket clients.

    Events are not buffered for absent subscribers; a client gets a state
    snapshot from the DB on connect and live events thereafter.
    """

    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[Event]]] = {}

    def subscribe(self, job_id: str) -> asyncio.Queue[Event]:
        queue: asyncio.Queue[Event] = asyncio.Queue()
        self._subscribers.setdefault(job_id, set()).add(queue)
        return queue

    def unsubscribe(self, job_id: str, queue: asyncio.Queue[Event]) -> None:
        subscribers = self._subscribers.get(job_id)
        if subscribers is None:
            return
        subscribers.discard(queue)
        if not subscribers:
            del self._subscribers[job_id]

    async def publish(self, job_id: str, event: Event) -> None:
        for queue in list(self._subscribers.get(job_id, ())):
            queue.put_nowait(event)
