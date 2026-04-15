from typing import Any, List, Optional

from pydantic import BaseModel, Field


class BookmarkOut(BaseModel):
    id: str
    name: str
    host: Optional[str] = None
    database: Optional[str] = None


class BookmarkIn(BaseModel):
    name: str
    url: str


class ColumnInfo(BaseModel):
    name: str
    data_type: str
    nullable: bool
    default: Optional[str] = None
    is_pk: bool = False


class IndexInfo(BaseModel):
    name: str
    columns: List[str]
    unique: bool
    primary: bool


class FKInfo(BaseModel):
    name: str
    columns: List[str]
    ref_schema: str
    ref_table: str
    ref_columns: List[str]


class TableInfo(BaseModel):
    model_config = {"populate_by_name": True}

    schema_name: str = Field(alias="schema")
    name: str
    estimated_rows: Optional[int] = None
    primary_key: List[str]
    columns: List[ColumnInfo]
    indexes: List[IndexInfo]
    foreign_keys: List[FKInfo]


class TableSummary(BaseModel):
    model_config = {"populate_by_name": True}

    schema_name: str = Field(alias="schema")
    name: str
    kind: str


class RowsResponse(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    total: Optional[int] = None


class QueryRequest(BaseModel):
    sql: str


class QueryResponse(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    row_count: int
    duration_ms: float
    notice: Optional[str] = None
