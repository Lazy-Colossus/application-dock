"""KitchenCraft API router.

One recipe collection and one shopping list, shared by every signed-in user.
Signing in is still required — the router-level `get_current_user` guards every
route — but who is signed in no longer selects anything. This module is the
only place KitchenCraft's stdlib exceptions become `HTTPException` (NFR-2).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.kitchencraft import (
    AddShoppingItemRequest,
    AddShoppingItemsRequest,
    CreateRecipeRequest,
    Recipe,
    ShoppingItem,
    ShoppingList,
    UpdateRecipeRequest,
    UpdateShoppingItemRequest,
    Vocabulary,
)
from app.services import kitchencraft_service as service

router = APIRouter(
    prefix="/api/kitchencraft",
    tags=["kitchencraft"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/recipes", response_model=list[Recipe])
def list_recipes() -> list[Recipe]:
    return service.list_recipes()


@router.post("/recipes", response_model=Recipe)
def create_recipe(
    req: CreateRecipeRequest,
) -> Recipe:
    try:
        return service.create_recipe(
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
def get_vocabulary() -> Vocabulary:
    # Before `/recipes/{recipe_id}` would also match, but keeping it above the
    # parameterised route makes the ordering independent of that.
    return service.get_vocabulary()


@router.get("/recipes/{recipe_id}", response_model=Recipe)
def get_recipe(recipe_id: str) -> Recipe:
    try:
        return service.get_recipe(recipe_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Recipe not found") from exc


@router.put("/recipes/{recipe_id}", response_model=Recipe)
def update_recipe(
    recipe_id: str,
    req: UpdateRecipeRequest,
) -> Recipe:
    # PUT (not PATCH) to match the frontend `useApi` boundary and the rest of
    # the dock. `exclude_unset` is what makes an explicit null mean "clear this"
    # while an absent key means "leave it alone" — the distinction FR-6 needs,
    # and the reason an edit of the meal type cannot touch the body.
    changes = req.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    try:
        return service.update_recipe(recipe_id, changes)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Recipe not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/recipes/{recipe_id}", status_code=204)
def delete_recipe(recipe_id: str) -> None:
    try:
        service.delete_recipe(recipe_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Recipe not found") from exc


# -- The shopping list --------------------------------------------------------
# One list for the whole household. There is no list id in any path and no
# route for creating, naming or deleting a list (FR-14).


@router.get("/shopping-list", response_model=ShoppingList)
def get_shopping_list() -> ShoppingList:
    return service.get_shopping_list()


@router.post("/shopping-list/items", response_model=ShoppingItem)
def add_shopping_item(
    req: AddShoppingItemRequest,
) -> ShoppingItem:
    try:
        return service.add_shopping_item(req.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# Declared before the parameterised routes so "bulk" is never read as an id.
@router.post("/shopping-list/items/bulk", response_model=list[ShoppingItem])
def add_shopping_items(
    req: AddShoppingItemsRequest,
) -> list[ShoppingItem]:
    try:
        return service.add_shopping_items(req.texts, req.mode)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/shopping-list/items/{item_id}", response_model=ShoppingItem)
def update_shopping_item(
    item_id: str,
    req: UpdateShoppingItemRequest,
) -> ShoppingItem:
    try:
        return service.set_item_ticked(item_id, req.ticked)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Item not found") from exc


# Declared before the parameterised delete so "items" is never read as an id.
@router.delete("/shopping-list/items", status_code=204)
def clear_shopping_list() -> None:
    service.clear_shopping_list()


@router.delete("/shopping-list/items/{item_id}", status_code=204)
def delete_shopping_item(
    item_id: str,
) -> None:
    try:
        service.delete_shopping_item(item_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Item not found") from exc
