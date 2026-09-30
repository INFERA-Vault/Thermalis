"""
Transparent multi-signal evidence fusion for PS-162 event triage.

This service deliberately does not output a probability of fire.  FIRMS,
land-cover, OSM, and persistence signals provide useful operational evidence,
but they are not a labelled fire-confirmation dataset.  The result is
therefore an auditable evidence score with an explicit data-coverage value.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional


class EvidenceFusionService:
    """Compute a deterministic, explainable thermal-origin evidence profile."""

    METHOD_VERSION = "TCEF-v1"
    # Weights are intentionally visible and sum to 1.0.
    WEIGHTS = {
        "thermal_signal": 0.30,
        "temporal_persistence": 0.25,
        "industrial_context": 0.25,
        "land_cover_context": 0.10,
        "sensor_confidence": 0.07,
        "corroboration_coverage": 0.03,
    }

    @staticmethod
    def _read(value: Any, key: str, default: Any = None) -> Any:
        if isinstance(value, dict):
            return value.get(key, default)
        return getattr(value, key, default)

    @staticmethod
    def _number(value: Any) -> Optional[float]:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if math.isfinite(number) else None

    @staticmethod
    def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
        return max(low, min(high, value))

    @classmethod
    def _confidence_score(cls, value: Any) -> Optional[float]:
        if value is None:
            return None
        numeric = cls._number(value)
        if numeric is not None:
            return cls._clamp(numeric / 100.0 if numeric > 1 else numeric)
        normalized = str(value).strip().lower()
        return {"high": 1.0, "h": 1.0, "nominal": 0.65, "n": 0.65, "low": 0.35, "l": 0.35}.get(normalized)

    @classmethod
    def _thermal_signal(cls, event: Any, firms: Dict[str, Any]) -> tuple[Optional[float], str]:
        frp = cls._number(firms.get("frp", cls._read(event, "frp")))
        brightness = cls._number(firms.get("brightness_temperature", cls._read(event, "brightness_temperature")))
        components: List[tuple[float, float]] = []

        if frp is not None:
            # FRP is heavy-tailed; log scaling avoids one extreme value dominating.
            components.append((cls._clamp(math.log1p(max(frp, 0.0)) / math.log1p(50.0)), 0.65))
        if brightness is not None:
            components.append((cls._clamp((brightness - 300.0) / 70.0), 0.35))

        if not components:
            return None, "FRP and brightness temperature are unavailable."
        total_weight = sum(weight for _, weight in components)
        score = sum(value * weight for value, weight in components) / total_weight
        return score, "Uses log-scaled FRP and brightness temperature as a thermal-intensity signal."

    @classmethod
    def _persistence_signal(cls, feature_record: Any, temporal: Dict[str, Any]) -> tuple[Optional[float], str]:
        candidates = [
            (cls._number(temporal.get("active_days", cls._read(feature_record, "persistence_days"))), 0.45, 7.0),
            (cls._number(temporal.get("observation_count", cls._read(feature_record, "hotspot_frequency_30d"))), 0.35, 8.0),
            (cls._number(temporal.get("persistence_duration_days", cls._read(feature_record, "persistence_days"))), 0.20, 14.0),
        ]
        available = [(value, weight, scale) for value, weight, scale in candidates if value is not None]
        if not available:
            return None, "No temporal recurrence features are available."
        total_weight = sum(weight for _, weight, _ in available)
        score = sum(cls._clamp(max(value, 0.0) / scale) * weight for value, weight, scale in available) / total_weight
        return score, "Combines active days, 30-day recurrence, and persistence duration."

    @classmethod
    def _industrial_context_signal(cls, feature_record: Any, osm: Dict[str, Any]) -> tuple[Optional[float], str]:
        distance = cls._number(osm.get("nearest_facility_distance", cls._read(feature_record, "distance_to_facility_meters")))
        count = cls._number(osm.get("nearby_industrial_facility_count", cls._read(feature_record, "nearby_facility_count")))
        components: List[tuple[float, float]] = []
        if distance is not None:
            components.append((cls._clamp(1.0 - max(distance, 0.0) / 2000.0), 0.70))
        if count is not None:
            components.append((cls._clamp(max(count, 0.0) / 3.0), 0.30))
        if not components:
            return None, "OSM facility context is unavailable."
        total_weight = sum(weight for _, weight in components)
        score = sum(value * weight for value, weight in components) / total_weight
        return score, "Uses distance and count of nearby mapped industrial facilities; proximity is context, not proof."

    @classmethod
    def _land_cover_signal(cls, worldcover: Dict[str, Any]) -> tuple[Optional[float], str]:
        code = cls._number(worldcover.get("land_cover_at_event"))
        if code is None:
            return None, "Land-cover class is unavailable."
        if int(code) == 50:  # ESA WorldCover built-up
            return 1.0, "Built-up land increases industrial-context evidence."
        if int(code) == 40:  # ESA WorldCover cropland
            return 0.0, "Cropland is a counter-signal for an industrial origin."
        return 0.40, "The observed land-cover class is neither a strong industrial nor agricultural signal."

    @classmethod
    def _corroboration_signal(cls, satellite: Dict[str, Any]) -> tuple[Optional[float], str]:
        if not satellite:
            return None, "Linked Sentinel metadata is unavailable."
        sentinel_count = (cls._number(satellite.get("sentinel1_observations")) or 0.0) + (cls._number(satellite.get("sentinel2_observations")) or 0.0)
        return (1.0 if sentinel_count > 0 else 0.0), "Linked Sentinel metadata indicates corroboration coverage; it does not confirm a fire without pixel-level analysis."

    def assess(
        self,
        event: Any,
        feature_record: Any,
        reference_model_probability: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Return a JSON-safe evidence assessment for one thermal event."""
        additional = self._read(feature_record, "additional_features", {}) or {}
        firms = additional.get("firms", {}) or {}
        temporal = additional.get("temporal", {}) or {}
        osm = additional.get("osm", {}) or {}
        satellite = additional.get("satellite", {}) or {}
        worldcover = additional.get("worldcover", {}) or {}

        signal_builders = {
            "thermal_signal": self._thermal_signal(event, firms),
            "temporal_persistence": self._persistence_signal(feature_record, temporal),
            "industrial_context": self._industrial_context_signal(feature_record, osm),
            "land_cover_context": self._land_cover_signal(worldcover),
            "sensor_confidence": (
                self._confidence_score(firms.get("confidence", self._read(event, "confidence"))),
                "Uses the FIRMS confidence field; it measures detection confidence, not origin."
            ),
            "corroboration_coverage": self._corroboration_signal(satellite),
        }

        signals = []
        missing_signals = []
        weighted_score = 0.0
        observed_weight = 0.0
        for key, weight in self.WEIGHTS.items():
            score, explanation = signal_builders[key]
            available = score is not None
            if available:
                score = self._clamp(float(score))
                weighted_score += score * weight
                observed_weight += weight
            else:
                missing_signals.append(key)
            signals.append({
                "key": key,
                "label": key.replace("_", " ").title(),
                "score": round(score * 100.0, 1) if available else None,
                "weight": weight,
                "available": available,
                "explanation": explanation,
            })

        evidence_score = round(weighted_score * 100.0, 1)
        observed_strength = round((weighted_score / observed_weight) * 100.0, 1) if observed_weight else 0.0
        data_coverage = round(observed_weight * 100.0, 1)

        by_key = {signal["key"]: signal["score"] for signal in signals}
        industrial_score = (by_key.get("industrial_context") or 0.0) / 100.0
        persistence_score = (by_key.get("temporal_persistence") or 0.0) / 100.0
        thermal_score = (by_key.get("thermal_signal") or 0.0) / 100.0
        land_score = by_key.get("land_cover_context")
        land_cover_code = self._number(worldcover.get("land_cover_at_event"))
        natural_vegetation = land_cover_code is not None and int(land_cover_code) in {10, 20, 30, 90, 95}

        if data_coverage < 45.0:
            interpretation = "INSUFFICIENT_EVIDENCE"
            priority = "LOW"
            recommendation = "Collect additional context before escalating this event."
        elif persistence_score >= 0.60 and industrial_score >= 0.50:
            interpretation = "PERSISTENT_INDUSTRIAL_HEAT_CONTEXT"
            priority = "HIGH" if evidence_score >= 55.0 else "MEDIUM"
            recommendation = "Review facility operations and corroborating imagery; persistence may indicate a heat source rather than an acute fire."
        elif industrial_score >= 0.50 and thermal_score >= 0.65:
            interpretation = "INDUSTRIAL_THERMAL_SOURCE_REVIEW"
            priority = "HIGH" if evidence_score >= 55.0 else "MEDIUM"
            recommendation = "Prioritize site verification and incident-owner review."
        elif natural_vegetation and industrial_score < 0.35 and persistence_score < 0.60:
            interpretation = "POSSIBLE_WILDFIRE_OR_NATURAL_BURNING"
            priority = "MEDIUM" if thermal_score >= 0.60 else "LOW"
            recommendation = "Cross-check vegetation-fire products, burn perimeters, and local incident reports before industrial escalation."
        elif land_score is not None and land_score <= 25.0 and industrial_score < 0.35:
            interpretation = "POSSIBLE_NON_INDUSTRIAL_BURNING"
            priority = "MEDIUM" if evidence_score >= 40.0 else "LOW"
            recommendation = "Compare with agricultural-burning context and keep industrial escalation low unless new evidence arrives."
        elif evidence_score >= 55.0:
            interpretation = "MULTI_SIGNAL_REVIEW_REQUIRED"
            priority = "MEDIUM"
            recommendation = "Send for analyst review; the signals do not support an automatic origin decision."
        else:
            interpretation = "LOW_SIGNAL_THERMAL_ANOMALY"
            priority = "LOW"
            recommendation = "Monitor for recurrence or stronger industrial context."

        top_evidence = [
            signal["explanation"]
            for signal in sorted(
                (signal for signal in signals if signal["available"]),
                key=lambda signal: (signal["score"] or 0.0) * signal["weight"],
                reverse=True,
            )[:3]
        ]

        return {
            "method_version": self.METHOD_VERSION,
            "event_id": int(self._read(event, "id")),
            "evidence_score": evidence_score,
            "observed_signal_strength": observed_strength,
            "data_coverage": data_coverage,
            "priority": priority,
            "interpretation": interpretation,
            "recommendation": recommendation,
            "signals": signals,
            "top_evidence": top_evidence,
            "missing_signals": missing_signals,
            "reference_model_used": reference_model_probability is not None,
            "caution": "Operational evidence score only—not a calibrated probability and not confirmation of an industrial fire.",
        }


evidence_fusion_service = EvidenceFusionService()
