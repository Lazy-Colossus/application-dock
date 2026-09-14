"""KitchenCraft API router.

Per-user recipe collections. Every route is scoped to the authenticated user via
`get_current_user`; the username selects the on-disk file and is never taken
from request input (FR-2, NFR-5). This module is the only place KitchenCraft's
stdlib exceptions become `HTTPException` (NFR-2).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.kitchencraft import (
    AddShoppingItemRequest,
    CreateRecipeRequest,
    Recipe,
    ShoppingItem,
    ShoppingList,
    UpdateRecipeRequest,
    UpdateShoppingItemRequest,
    Vocabulary,
)
from app.services import kitchencraft_service as service

router = APIRouter(prefix="/api/kitchencraft", tags=["kitchencraft"])


@router.get("/recipes", response_model=list[Recipe])
def list_recipes(current_user: str = Depends(get_current_user)) -> list[Recipe]:
    return service.list_recipes(current_user)


@router.post("/recipes", response_model=Recipe)
def create_recipe(
    req: CreateRecipeRequest,
    current_user: str = Depends(get_current_user),
) -> Recipe:
    try:
        return service.create_recipe(
            current_user,
            name=req.name,
            body=req.body,
            rating=req.rating,
            meal_type=req.meal_type,
            total_time_minutes=req.total_time_minutes,
            servings=req.servings,
            source=req.source,
            tags=req.tags,
            ingredients=req.ingredients,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/vocabulary", response_model=Vocabulary)
def get_vocabulary(current_user: str = Depends(get_current_user)) -> Vocabulary:
    # Before `/recipes/{recipe_id}` would also match, but keeping it above the
    # parameterised route makes the ordering independent of that.
    return service.get_vocabulary(current_user)


@router.get("/recipes/{recipe_id}", response_model=Recipe)
def get_recipe(recipe_id: str, current_user: str = Depends(get_current_user)) -> Recipe:
    try:
        return service.get_recipe(current_user, recipe_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Recipe not found") from exc


@router.put("/recipes/{recipe_id}", response_model=Recipe)
def update_recipe(
    recipe_id: str,
    req: UpdateRecipeRequest,
    current_user: str = Depends(get_current_user),
) -> Recipe:
    # PUT (not PATCH) to match the frontend `useApi` boundary and the rest of
    # the dock. `exclude_unset` is what makes an explicit null mean "clear this"
    # while an absent key means "leave it alone" — the distinction FR-6 needs,
    # and the reason an edit of the meal type cannot touch the body.
    changes = req.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    try:
        return service.update_recipe(current_user, recipe_id, changes)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Recipe not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/recipes/{recipe_id}", status_code=204)
def delete_recipe(recipe_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        service.delete_recipe(current_user, recipe_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Recipe not found") from exc


# -- The shopping list --------------------------------------------------------
# One list per user, selected by the JWT username. There is no list id in any
# path and no route for creating, naming or deleting a list (FR-14).


@router.get("/shopping-list", response_model=ShoppingList)
def get_shopping_list(current_user: str = Depends(get_current_user)) -> ShoppingList:
    return service.get_shopping_list(current_user)


@router.post("/shopping-list/items", response_model=ShoppingItem)
def add_shopping_item(
    req: AddShoppingItemRequest,
    current_user: str = Depends(get_current_user),
) -> ShoppingItem:
    try:
        return service.add_shopping_item(current_user, req.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/shopping-list/items/{item_id}", response_model=ShoppingItem)
def update_shopping_item(
    item_id: str,
    req: UpdateShoppingItemRequest,
    current_user: str = Depends(get_current_user),
) -> ShoppingItem:
    try:
        return service.set_item_ticked(current_user, item_id, req.ticked)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Item not found") from exc


# Declared before the parameterised delete so "items" is never read as an id.
@router.delete("/shopping-list/items", status_code=204)
def clear_shopping_list(current_user: str = Depends(get_current_user)) -> None:
    service.clear_shopping_list(current_user)


@router.delete("/shopping-list/items/{item_id}", status_code=204)
def delete_shopping_item(
    item_id: str,
    current_user: str = Depends(get_current_user),
) -> None:
    try:
        service.delete_shopping_item(current_user, item_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Item not found") from exc
