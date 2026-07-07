class JobCancelled(Exception):
    """Raised by a job handler when a cancellation was requested cooperatively."""


class ComfyError(Exception):
    """A ComfyUI call failed or the backend reported an execution error."""
