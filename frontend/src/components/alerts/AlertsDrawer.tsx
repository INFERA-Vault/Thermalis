import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Info, RotateCw } from 'lucide-react';
import { AlertItem, AlertCountResponse } from '../../types';
import { api } from '../../services/api';
import { formatRelativeTime } from '../../utils/timeUtils';
import { LiquidGlassSurface } from '../ui/LiquidGlassSurface';
import { LiquidGlassButton } from '../ui/LiquidGlassButton';

interface AlertsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEventId: (eventId: number) => void;
  onAlertCountUpdated?: () => void;
  counts?: AlertCountResponse | null;
  onRefreshFirms?: () => Promise<any>;
  lastSyncAt?: string;
}

export const AlertsDrawer: React.FC<AlertsDrawerProps> = ({
  isOpen,
  onClose,
  onSelectEventId,
  onAlertCountUpdated,
  counts: externalCounts,
  onRefreshFirms,
  lastSyncAt
}) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [localCounts, setLocalCounts] = useState<AlertCountResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [refreshFeedback, setRefreshFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const listRef = useRef<HTMLDivElement | null>(null);

  const counts = localCounts || externalCounts;

  const fetchCounts = useCallback(async () => {
    try {
      const data = await api.getAlertCount();
      setLocalCounts(data);
    } catch (err) {
      console.warn('Failed to fetch alert counts:', err);
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAlerts({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        limit: 100
      });
      setAlerts(data);
    } catch (err: any) {
      console.warn('Failed to fetch alerts:', err);
      setError(err.message || 'Unable to retrieve alerts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const handleManualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshFeedback(null);

    try {
      let summary: any = null;
      if (onRefreshFirms) {
        summary = await onRefreshFirms();
      } else {
        summary = await api.refreshFirms();
        if (onAlertCountUpdated) onAlertCountUpdated();
      }

      // Reload alerts list and counts inside drawer
      await fetchAlerts();
      await fetchCounts();

      const persisted = summary?.persisted_records ?? 0;
      const status = summary?.status;

      if (status === 'failed') {
        setRefreshFeedback({
          type: 'error',
          message: summary?.details?.error ? `FIRMS refresh failed: ${summary.details.error}` : 'Unable to refresh FIRMS data'
        });
      } else if (persisted > 0) {
        setRefreshFeedback({
          type: 'success',
          message: `FIRMS feed refreshed (${persisted} new observation${persisted > 1 ? 's' : ''})`
        });
      } else {
        setRefreshFeedback({
          type: 'info',
          message: 'FIRMS feed is up to date'
        });
      }
    } catch (err: any) {
      console.warn('Manual FIRMS refresh error:', err);
      setRefreshFeedback({
        type: 'error',
        message: err.message || 'Unable to refresh FIRMS data'
      });
    } finally {
      setRefreshing(false);
      setTimeout(() => {
        setRefreshFeedback(null);
      }, 5000);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAlerts();
      fetchCounts();
    }
  }, [isOpen, fetchAlerts, fetchCounts]);

  // Reset scroll position on filter tab change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [statusFilter]);

  const handleAcknowledge = async (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    try {
      await api.acknowledgeAlert(alertId);
      await fetchAlerts();
      await fetchCounts();
      if (onAlertCountUpdated) onAlertCountUpdated();
    } catch (err: any) {
      console.error('Error acknowledging alert:', err);
    }
  };

  const handleResolve = async (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    try {
      await api.resolveAlert(alertId);
      await fetchAlerts();
      await fetchCounts();
      if (onAlertCountUpdated) onAlertCountUpdated();
    } catch (err: any) {
      console.error('Error resolving alert:', err);
    }
  };

  const formatAlertTypeName = (type: string) => {
    switch (type) {
      case 'INDUSTRIAL_HEAT_SOURCE_ALERT':
        return 'Industrial Heat Source';
      case 'NEW_THERMAL_ANOMALY':
        return 'New Thermal Anomaly';
      case 'PERSISTENT_THERMAL_ACTIVITY':
        return 'Persistent Thermal Activity';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-[#FF0000]/15 text-[#FF0000] border-[#FF0000]/40 font-bold';
      case 'HIGH':
        return 'bg-[#E74D02]/15 text-[#E74D02] border-[#E74D02]/40';
      case 'MEDIUM':
        return 'bg-[#FF9F00]/15 text-[#FF9F00] border-[#FF9F00]/40';
      case 'LOW':
      default:
        return 'bg-[#FCB42C]/15 text-[#FCB42C] border-[#FCB42C]/40';
    }
  };

  const getSeverityBorder = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'border-l-2 border-l-[#FF0000]';
      case 'HIGH':
        return 'border-l-2 border-l-[#E74D02]';
      case 'MEDIUM':
        return 'border-l-2 border-l-[#FF9F00]';
      case 'LOW':
      default:
        return 'border-l-2 border-l-[#FCB42C]';
    }
  };

  const formatSyncTime = (isoString?: string) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hours}:${mins} UTC`;
    } catch {
      return null;
    }
  };

  const lastSyncStr = formatSyncTime(lastSyncAt);

  if (!isOpen) return null;

  const activeCount = counts?.active_alerts ?? (statusFilter === 'ACTIVE' ? alerts.length : 0);

  return (
    <div 
      className="fixed inset-0 z-50 flex justify-end bg-black/60 select-none backdrop-blur-xs"
      onClick={onClose}
    >
      <LiquidGlassSurface
        as="aside"
        type="rounded"
        level={3}
        surfaceKey="floatingPanels"
        borderRadius={0}
        variant="critical"
        className="w-full max-w-sm h-full flex flex-col min-h-0"
        contentClassName="flex flex-col h-full min-h-0"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#262322] bg-[#0C0E11]/80 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FF0000] animate-pulse shrink-0" />
              <span className="text-xs font-bold text-[#F4F4F5] uppercase tracking-wider">
                Thermal Alerts
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40">
                {activeCount} Active
              </span>
              <span
                className="w-4 h-4 rounded-full bg-[#181A20] border border-[#2B2F38] flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F5] cursor-help transition-colors"
                title="FIRMS = satellite thermal observations.&#10;Active Alerts = operational notifications generated from those observations.&#10;A single observation can generate multiple alert types."
              >
                <Info size={10} />
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                aria-label="Refresh FIRMS data"
                title={refreshing ? "Refreshing FIRMS data..." : "Refresh FIRMS data"}
                className={`p-1 rounded text-[#94908D] hover:text-[#FF5A00] hover:bg-[#1A1D23] transition-colors focus:outline-hidden focus:ring-1 focus:ring-[#FF5A00]/50 ${
                  refreshing ? 'opacity-70 cursor-not-allowed text-[#FF5A00]' : ''
                }`}
              >
                <RotateCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={onClose}
                aria-label="Close drawer"
                className="text-[#94908D] hover:text-[#F4F4F5] p-1 rounded hover:bg-[#1A1D23] transition-colors focus:outline-hidden focus:ring-1 focus:ring-[#94908D]/50"
                title="Close drawer"
              >
                <X size={15} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10.5px] text-[#94908D] leading-tight">
            <span>Operational alerts generated from thermal observations</span>
            {lastSyncStr && (
              <span className="text-[10px] font-mono text-[#71717A] ml-2 shrink-0" title={`Last FIRMS Sync: ${lastSyncAt}`}>
                Last FIRMS sync: <span className="text-[#A1A1AA]">{lastSyncStr}</span>
              </span>
            )}
          </div>

          {/* Temporary Refresh Feedback */}
          {refreshFeedback && (
            <div
              className={`mt-2 px-2.5 py-1.5 rounded text-[11px] font-mono border flex items-center justify-between transition-all ${
                refreshFeedback.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : refreshFeedback.type === 'error'
                  ? 'bg-[#611511]/30 border-[#E74D02]/40 text-[#FF9F00]'
                  : 'bg-[#181A20] border-[#2B2F38] text-[#D4D4D8]'
              }`}
            >
              <span>{refreshFeedback.message}</span>
              <button
                onClick={() => setRefreshFeedback(null)}
                className="text-xs text-[#71717A] hover:text-white ml-2"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Status Filters & Breakdown */}
        <div className="px-3.5 py-2 border-b border-[#262322] bg-[#0C0E11]/60 flex flex-col gap-1.5 shrink-0">
          {/* Filter Tabs */}
          <div className="flex items-center justify-between gap-1 text-xs">
            {(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'EXPIRED', 'ALL'] as const).map(st => {
              const isSelected = statusFilter === st;
              const displayLabel = st === 'ACKNOWLEDGED' ? 'ACK' : st === 'EXPIRED' ? 'EXP' : st;
              let countVal: number | undefined;
              if (counts) {
                if (st === 'ACTIVE') countVal = counts.active_alerts;
                else if (st === 'ACKNOWLEDGED') countVal = counts.acknowledged_alerts;
                else if (st === 'RESOLVED') countVal = counts.resolved_alerts;
                else if (st === 'EXPIRED') countVal = counts.expired_alerts;
                else if (st === 'ALL') countVal = counts.total_alerts;
              }
              return (
                <LiquidGlassButton
                  key={st}
                  size="sm"
                  active={isSelected}
                  variant={isSelected ? 'fire-active' : 'default'}
                  onClick={() => setStatusFilter(st)}
                  className="text-[10px] py-0.5 px-1.5 flex-1"
                >
                  <span>{displayLabel}</span>
                  {countVal !== undefined && (
                    <span className={`text-[9px] font-mono ml-0.5 ${isSelected ? 'text-[#FFD000]' : 'text-[#71717A]'}`}>
                      ({countVal})
                    </span>
                  )}
                </LiquidGlassButton>
              );
            })}
          </div>

          {/* Compact Metrics Breakdown */}
          {counts && (
            <div 
              className="flex items-center justify-between px-2 py-1 bg-[#111317] border border-[#1F2227] rounded text-[9px] font-mono text-[#8C8885]"
              title="Alert status distribution across operational records"
            >
              <span>ACTIVE <strong className="text-[#EF4444] font-semibold">{counts.active_alerts}</strong></span>
              <span className="text-[#383330]">|</span>
              <span>ACK <strong className="text-[#FF9F00] font-semibold">{counts.acknowledged_alerts ?? 0}</strong></span>
              <span className="text-[#383330]">|</span>
              <span>RESOLVED <strong className="text-emerald-400 font-semibold">{counts.resolved_alerts ?? 0}</strong></span>
              <span className="text-[#383330]">|</span>
              <span>EXP <strong className="text-[#71717A] font-semibold">{counts.expired_alerts ?? 0}</strong></span>
              <span className="text-[#383330]">|</span>
              <span>TOTAL <strong className="text-[#F4F4F5] font-semibold">{counts.total_alerts ?? 0}</strong></span>
            </div>
          )}
        </div>

        {/* Dedicated Scrollable Alert List */}
        <div 
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-2 text-xs alerts-scroll-container"
        >
          {loading && alerts.length === 0 && (
            <div className="text-center py-8 text-[#94908D] text-xs">
              Loading alerts...
            </div>
          )}

          {error && (
            <div className="p-2.5 bg-[#611511]/20 border border-[#E74D02]/30 rounded text-[#FF9F00] text-xs">
              {error}
            </div>
          )}

          {!loading && alerts.length === 0 && !error && (
            <div className="text-center py-12 text-[#686360] text-xs">
              No alerts in this category.
            </div>
          )}

          {alerts.map(alert => (
            <div
              key={alert.id}
              onClick={() => {
                onSelectEventId(alert.thermal_event_id);
                onClose();
              }}
              className={`p-2.5 bg-[#0C0E11] border border-[#262322] hover:border-[#383330] cursor-pointer rounded transition-colors ${getSeverityBorder(alert.severity)}`}
            >
              {/* Header with Type & Severity */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold text-[#F4F4F5] text-xs truncate">
                    {alert.title}
                  </span>
                  {alert.alert_type && (
                    <span className="text-[9.5px] text-[#A1A1AA] font-mono tracking-tight flex items-center gap-1 mt-0.5">
                      <span className="w-1 h-1 rounded-full bg-[#FF5A00]" />
                      {formatAlertTypeName(alert.alert_type)}
                    </span>
                  )}
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold font-mono shrink-0 border ${getSeverityBadge(alert.severity)}`}>
                  {alert.severity}
                </span>
              </div>

              {/* Message */}
              <div className="text-[#94908D] text-[11px] leading-relaxed mb-2">
                {alert.message}
              </div>

              {/* Meta & Actions */}
              <div className="flex items-center justify-between pt-1.5 border-t border-[#262322] text-[10px]">
                <div className="text-[#686360] font-mono">
                  <span>Event #{alert.thermal_event_id}</span>
                  <span className="mx-1">•</span>
                  <span>{formatRelativeTime(alert.created_at)}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {alert.status === 'ACTIVE' && (
                    <button
                      onClick={e => handleAcknowledge(e, alert.id)}
                      className="gis-button text-[10px] px-2 py-0.5"
                    >
                      Ack
                    </button>
                  )}

                  {alert.status !== 'RESOLVED' && (
                    <button
                      onClick={e => handleResolve(e, alert.id)}
                      className="gis-button text-[10px] px-2 py-0.5 text-emerald-400 border-emerald-500/30 hover:border-emerald-500"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </LiquidGlassSurface>
    </div>
  );
};
