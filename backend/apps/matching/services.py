"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Matching App Services: Deterministic 4-Factor Lost/Found Scoring Engine
==============================================================================
Weights:
- Description and keyword similarity: 40%
- Category and compatible attributes: 25%
- Campus location proximity: 20%
- Event-time proximity: 15%
"""

import re
from apps.core.workflow_concurrency import (
    item_scope,
    retry_transient_mongo_transaction,
    workflow_transaction,
)
from apps.items.models import Item, ItemType, ItemStatus
from .models import MatchSuggestion, MatchConfidence, MatchStatus

STOP_WORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'is', 'are', 'was', 'were', 'it', 'this', 'that', 'i', 'my', 'me', 'we', 'our', 'you', 'your',
    'left', 'found', 'lost', 'near', 'inside', 'outside', 'around', 'table', 'floor', 'room', 'desk',
    'bench', 'please', 'help', 'misplaced', 'color', 'colour', 'brand', 'item', 'lpu', 'campus', 'block'
}

CAMPUS_ZONE_ADJACENCY = {
    'BLOCK_30_38': ['CENTRAL_LIBRARY', 'ROBOPARK_BALDEV_RAJ_MITTAL', 'OTHER_CAMPUS_AREA'],
    'BLOCK_55_58': ['UNI_MALL', 'ROBOPARK_BALDEV_RAJ_MITTAL', 'OTHER_CAMPUS_AREA'],
    'UNI_MALL': ['BLOCK_55_58', 'RESIDENTIAL_BOYS_BH', 'MAIN_GATE_SECURITY'],
    'CENTRAL_LIBRARY': ['BLOCK_30_38', 'ROBOPARK_BALDEV_RAJ_MITTAL'],
    'INDOOR_STADIUM_SHANTI_DEVI': ['RESIDENTIAL_GIRLS_GH', 'MAIN_GATE_SECURITY'],
    'RESIDENTIAL_BOYS_BH': ['UNI_MALL', 'MAIN_GATE_SECURITY', 'OTHER_CAMPUS_AREA'],
    'RESIDENTIAL_GIRLS_GH': ['INDOOR_STADIUM_SHANTI_DEVI', 'MAIN_GATE_SECURITY', 'OTHER_CAMPUS_AREA'],
    'MAIN_GATE_SECURITY': ['UNI_MALL', 'RESIDENTIAL_BOYS_BH', 'RESIDENTIAL_GIRLS_GH', 'INDOOR_STADIUM_SHANTI_DEVI'],
    'ROBOPARK_BALDEV_RAJ_MITTAL': ['BLOCK_30_38', 'BLOCK_55_58', 'CENTRAL_LIBRARY'],
    'OTHER_CAMPUS_AREA': ['BLOCK_30_38', 'BLOCK_55_58', 'UNI_MALL', 'CENTRAL_LIBRARY'],
}

COMPATIBLE_CATEGORIES = {
    'BAGS_BACKPACKS': ['CLOTHING_ACCESSORIES', 'OTHERS'],
    'CLOTHING_ACCESSORIES': ['BAGS_BACKPACKS', 'OTHERS'],
    'DOCUMENTS_BOOKS': ['STUDENT_ID_CARDS', 'OTHERS'],
    'STUDENT_ID_CARDS': ['DOCUMENTS_BOOKS', 'WALLETS_PURSE'],
    'WALLETS_PURSE': ['STUDENT_ID_CARDS', 'OTHERS'],
    'ELECTRONICS': ['OTHERS'],
}

def extract_significant_tokens(text: str) -> list[str]:
    """Tokenize text into normalized lowercase alphanumeric tokens filtering noise stop words."""
    if not text:
        return []
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', ' ', text.lower())
    tokens = cleaned.split()
    return [t for t in tokens if len(t) >= 2 and t not in STOP_WORDS]

def calculate_item_match_score(item_a: Item, item_b: Item) -> dict:
    """
    Computes deterministic match score (0-100) and factors between two campus items.
    """
    # 1. Keyword & Description Similarity (40%)
    text_a = f"{item_a.title} {item_a.public_description} {item_a.specific_location}"
    text_b = f"{item_b.title} {item_b.public_description} {item_b.specific_location}"

    tokens_a = set(extract_significant_tokens(text_a))
    tokens_b = set(extract_significant_tokens(text_b))

    intersection = sorted(list(tokens_a.intersection(tokens_b)))
    union = tokens_a.union(tokens_b)
    jaccard = (len(intersection) / len(union)) if union else 0.0

    title_tokens_a = extract_significant_tokens(item_a.title)
    title_tokens_b = set(extract_significant_tokens(item_b.title))
    title_bonus = sum(0.25 for tt in title_tokens_a if tt in title_tokens_b)

    raw_keyword_factor = min(1.0, (jaccard * 1.5) + title_bonus)
    keyword_score = round(raw_keyword_factor * 40)

    # 2. Category & Compatible Attributes (25%)
    cat_code_a = item_a.category.code if hasattr(item_a.category, 'code') else str(item_a.category)
    cat_code_b = item_b.category.code if hasattr(item_b.category, 'code') else str(item_b.category)

    raw_category_factor = 0.0
    category_explanation = 'Category mismatch'

    if cat_code_a == cat_code_b:
        raw_category_factor = 1.0
        cat_name = getattr(item_a.category, 'name', cat_code_a)
        category_explanation = f"Exact category match ({cat_name})"
    elif cat_code_b in COMPATIBLE_CATEGORIES.get(cat_code_a, []):
        raw_category_factor = 0.45
        category_explanation = f"Compatible category overlap ({cat_code_a} vs {cat_code_b})"

    category_score = round(raw_category_factor * 25)

    # 3. Campus Location Proximity (20%)
    loc_zone_a = item_a.location.campus_zone if hasattr(item_a.location, 'campus_zone') else str(item_a.location)
    loc_zone_b = item_b.location.campus_zone if hasattr(item_b.location, 'campus_zone') else str(item_b.location)

    raw_location_factor = 0.1
    location_explanation = f"Different campus zones ({loc_zone_a} vs {loc_zone_b})"

    if item_a.location_id == item_b.location_id or loc_zone_a == loc_zone_b:
        raw_location_factor = 1.0
        location_explanation = f"Same campus zone ({loc_zone_a})"
    elif loc_zone_b in CAMPUS_ZONE_ADJACENCY.get(loc_zone_a, []):
        raw_location_factor = 0.65
        location_explanation = f"Adjacent campus zones ({loc_zone_a} & {loc_zone_b})"
    elif loc_zone_a == 'OTHER_CAMPUS_AREA' or loc_zone_b == 'OTHER_CAMPUS_AREA':
        raw_location_factor = 0.35
        location_explanation = "Shared general campus perimeter"

    location_score = round(raw_location_factor * 20)

    # 4. Event-Time Proximity (15%)
    date_a = item_a.event_date.timestamp()
    date_b = item_b.event_date.timestamp()
    delta_hours = abs(date_a - date_b) / 3600.0

    raw_time_factor = 0.05
    time_explanation = f"Reports over 30 days apart ({round(delta_hours / 24)} days)"

    if delta_hours <= 6:
        raw_time_factor = 1.0
        time_explanation = f"Within 6 hours ({round(delta_hours)}h delta)"
    elif delta_hours <= 24:
        raw_time_factor = 0.85
        time_explanation = "Within 24 hours (same day)"
    elif delta_hours <= 72:
        raw_time_factor = 0.65
        time_explanation = f"Within 3 days ({round(delta_hours / 24)}d delta)"
    elif delta_hours <= 168:
        raw_time_factor = 0.45
        time_explanation = f"Within 1 week ({round(delta_hours / 24)}d delta)"
    elif delta_hours <= 720:
        raw_time_factor = 0.25
        time_explanation = f"Within 30 days ({round(delta_hours / 24)}d delta)"

    time_score = round(raw_time_factor * 15)

    total_score = min(100.0, float(keyword_score + category_score + location_score + time_score))

    if total_score >= 75:
        confidence = MatchConfidence.HIGH
    elif total_score >= 50:
        confidence = MatchConfidence.MEDIUM
    else:
        confidence = MatchConfidence.LOW

    return {
        'matchScore': total_score,
        'confidence': confidence,
        'explanation': {
            'categoryMatch': category_explanation,
            'locationProximity': location_explanation,
            'timeDelta': time_explanation,
            'matchingTokens': intersection,
        },
        'breakdown': {
            'keywordScore': keyword_score,
            'categoryScore': category_score,
            'locationScore': location_score,
            'timeScore': time_score,
        },
    }

@retry_transient_mongo_transaction()
def generate_match_suggestions_for_item(item_id, threshold_score: float = 35.0) -> list[MatchSuggestion]:
    """
    Computes matches against opposite active item candidates and stores suggestions.
    Enforces canonical pair ordering (lost_item, found_item) and duplicate pair prevention.
    """
    try:
        current_item = Item.objects.select_related('category', 'location').get(pk=item_id, is_archived=False)
    except Item.DoesNotExist:
        return []

    target_type = ItemType.FOUND if current_item.item_type == ItemType.LOST else ItemType.LOST

    candidates = Item.objects.filter(
        item_type=target_type,
        is_archived=False,
        status__in=[ItemStatus.REPORTED, ItemStatus.IN_CUSTODY, ItemStatus.MATCH_PENDING],
    ).exclude(pk=current_item.pk).select_related('category', 'location')

    results = []
    has_high_confidence = False

    for candidate in candidates:
        scoring = calculate_item_match_score(current_item, candidate)
        if scoring['matchScore'] >= threshold_score:
            if scoring['confidence'] == MatchConfidence.HIGH:
                has_high_confidence = True

            lost_item = current_item if current_item.item_type == ItemType.LOST else candidate
            found_item = current_item if current_item.item_type == ItemType.FOUND else candidate

            with workflow_transaction(item_scope(lost_item.pk), item_scope(found_item.pk)):
                suggestion = MatchSuggestion.objects.filter(
                    lost_item=lost_item,
                    found_item=found_item,
                ).first()
                defaults = {
                    'match_score': scoring['matchScore'],
                    'confidence': scoring['confidence'],
                    'explanation': scoring['explanation'],
                    'status': MatchStatus.PENDING,
                }
                if suggestion is None:
                    suggestion = MatchSuggestion.objects.create(
                        lost_item=lost_item,
                        found_item=found_item,
                        **defaults,
                    )
                else:
                    for field, value in defaults.items():
                        setattr(suggestion, field, value)
                    suggestion.save(update_fields=[*defaults.keys(), 'updated_at'])
            results.append(suggestion)

    if has_high_confidence and current_item.status == ItemStatus.REPORTED:
        with workflow_transaction(item_scope(current_item.pk)):
            current_item = Item.objects.get(pk=current_item.pk)
            if current_item.status == ItemStatus.REPORTED:
                current_item.status = ItemStatus.MATCH_PENDING
                current_item.save(update_fields=['status'])

    return results

def refresh_all_match_suggestions(threshold_score: float = 35.0) -> int:
    """Batch re-computation across all active reports."""
    active_items = Item.objects.filter(
        is_archived=False,
        status__in=[ItemStatus.REPORTED, ItemStatus.IN_CUSTODY, ItemStatus.MATCH_PENDING],
    ).values_list('id', flat=True)

    total_created = 0
    for item_id in active_items:
        suggestions = generate_match_suggestions_for_item(item_id, threshold_score)
        total_created += len(suggestions)
    return total_created
