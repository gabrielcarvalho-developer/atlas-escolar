"""LangGraph agent state definition for Atlas Escolar."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    """Represents a single tool invocation in the plan."""
    tool_name: str
    arguments: dict[str, Any]
    step_id: int = 0


class PlanStep(BaseModel):
    """A step in the agent's execution plan."""
    id: int
    description: str
    tool_calls: list[ToolCall] = Field(default_factory=list)
    completed: bool = False
    result: dict[str, Any] | None = None


class AgentState(BaseModel):
    """Main state for the plan/execute/reflect agent graph."""
    question: str
    history: list[dict[str, str]] = Field(default_factory=list)
    school_code: str | None = None
    selection: dict[str, Any] = Field(default_factory=dict)

    # Planner output
    plan: list[PlanStep] = Field(default_factory=list)
    current_step: int = 0

    # Executor output
    evidence: list[dict[str, Any]] = Field(default_factory=list)

    # Reflector output
    reflection: str = ""
    is_complete: bool = False
    final_answer: str = ""

    # Metadata
    iteration: int = 0
    max_iterations: int = 3
    error: str | None = None
