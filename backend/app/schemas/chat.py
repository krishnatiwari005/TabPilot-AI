
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    page_title: str | None = Field(default=None, max_length=500)
    page_url: str | None = Field(default=None, max_length=2000)
    page_content: str | None = Field(default=None, max_length=12000)


class ChatResponse(BaseModel):
    answer: str
