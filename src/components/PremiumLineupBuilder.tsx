'use client';

import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  Trash2, 
  TrendingUp, 
  Settings, 
  Search, 
  Layers, 
  DollarSign, 
  Award, 
  UserPlus, 
  ArrowUpDown, 
  HelpCircle,
  X,
  Shield,
  Activity,
  Sliders,
  Sparkles,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

// Seed player roster matching Tottenham values and screenshot references
interface Player {
  id: string;
  name: string;
  shortName: string;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  rating: number;
  marketValue: number; // in £m
  weeklyWage: number;  // in £k
  contractLength: number; // in years
  nationality: string;
  flagUrl: string;
  imageColor: string; // fallback stylized color gradient
  isAcademy?: boolean;
}

const INITIAL_ROSTER: Player[] = [
  { id: '1', name: 'Guglielmo Vicario', shortName: 'Vicario', position: 'GK', rating: 84, marketValue: 35, weeklyWage: 120, contractLength: 4, nationality: 'Italy', flagUrl: '🇮🇹', imageColor: 'from-blue-600 to-cyan-500' },
  { id: '2', name: 'Cristian Romero', shortName: 'C. Romero', position: 'DF', rating: 88, marketValue: 65, weeklyWage: 165, contractLength: 4, nationality: 'Argentina', flagUrl: '🇦🇷', imageColor: 'from-cyan-600 to-sky-500' },
  { id: '3', name: 'Micky van de Ven', shortName: 'Van de Ven', position: 'DF', rating: 85, marketValue: 55, weeklyWage: 110, contractLength: 5, nationality: 'Netherlands', flagUrl: '🇳🇱', imageColor: 'from-orange-500 to-amber-600' },
  { id: '4', name: 'Destiny Udogie', shortName: 'Udogie', position: 'DF', rating: 83, marketValue: 45, weeklyWage: 85, contractLength: 5, nationality: 'Italy', flagUrl: '🇮🇹', imageColor: 'from-blue-500 to-purple-600' },
  { id: '5', name: 'Pedro Porro', shortName: 'Pedro Porro', position: 'DF', rating: 84, marketValue: 48, weeklyWage: 100, contractLength: 4, nationality: 'Spain', flagUrl: '🇪🇸', imageColor: 'from-red-500 to-yellow-500' },
  { id: '6', name: 'Yves Bissouma', shortName: 'Bissouma', position: 'MF', rating: 82, marketValue: 35, weeklyWage: 120, contractLength: 3, nationality: 'Mali', flagUrl: '🇲🇱', imageColor: 'from-green-600 to-emerald-500' },
  { id: '7', name: 'Pape Matar Sarr', shortName: 'Pape Sarr', position: 'MF', rating: 81, marketValue: 40, weeklyWage: 75, contractLength: 5, nationality: 'Senegal', flagUrl: '🇸🇳', imageColor: 'from-emerald-500 to-teal-600' },
  { id: '8', name: 'James Maddison', shortName: 'Maddison', position: 'MF', rating: 86, marketValue: 60, weeklyWage: 170, contractLength: 4, nationality: 'England', flagUrl: '🇬🇧', imageColor: 'from-amber-500 to-red-500' },
  { id: '9', name: 'Son Heung-min', shortName: 'Son', position: 'FW', rating: 87, marketValue: 50, weeklyWage: 190, contractLength: 2, nationality: 'South Korea', flagUrl: '🇰🇷', imageColor: 'from-red-600 to-blue-600' },
  { id: '10', name: 'Dominic Solanke', shortName: 'Solanke', position: 'FW', rating: 83, marketValue: 55, weeklyWage: 130, contractLength: 5, nationality: 'England', flagUrl: '🇬🇧', imageColor: 'from-purple-600 to-indigo-500' },
  { id: '11', name: 'Dejan Kulusevski', shortName: 'Kulusevski', position: 'FW', rating: 83, marketValue: 42, weeklyWage: 110, contractLength: 4, nationality: 'Sweden', flagUrl: '🇸🇪', imageColor: 'from-yellow-500 to-blue-500' },
  { id: '12', name: 'Radu Dragusin', shortName: 'Dragusin', position: 'DF', rating: 79, marketValue: 25, weeklyWage: 80, contractLength: 5, nationality: 'Romania', flagUrl: '🇷🇴', imageColor: 'from-yellow-600 to-red-500' },
  { id: '13', name: 'Archie Gray', shortName: 'Archie Gray', position: 'MF', rating: 78, marketValue: 30, weeklyWage: 75, contractLength: 6, nationality: 'England', flagUrl: '🇬🇧', imageColor: 'from-cyan-500 to-teal-500' },
  { id: '14', name: 'Lucas Bergvall', shortName: 'Bergvall', position: 'MF', rating: 77, marketValue: 20, weeklyWage: 50, contractLength: 5, nationality: 'Sweden', flagUrl: '🇸🇪', imageColor: 'from-yellow-400 to-sky-500' },
  { id: '15', name: 'Richarlison', shortName: 'Richarlison', position: 'FW', rating: 81, marketValue: 35, weeklyWage: 130, contractLength: 3, nationality: 'Brazil', flagUrl: '🇧🇷', imageColor: 'from-yellow-500 to-green-600' },
  { id: '16', name: 'Brennan Johnson', shortName: 'B. Johnson', position: 'FW', rating: 80, marketValue: 38, weeklyWage: 90, contractLength: 4, nationality: 'Wales', flagUrl: '🇬🇧', imageColor: 'from-red-600 to-rose-500' },
  { id: '17', name: 'Jan Paul van Hecke', shortName: 'van Hecke', position: 'DF', rating: 80, marketValue: 39, weeklyWage: 85, contractLength: 4, nationality: 'Netherlands', flagUrl: '🇳🇱', imageColor: 'from-orange-400 to-red-500' },
  { id: '18', name: 'Luka Vuskovic', shortName: 'Vuskovic', position: 'DF', rating: 75, marketValue: 52, weeklyWage: 40, contractLength: 5, nationality: 'Croatia', flagUrl: '🇭🇷', isAcademy: true, imageColor: 'from-red-500 to-white' },
  { id: '19', name: 'Mikey Moore', shortName: 'Mikey Moore', position: 'FW', rating: 74, marketValue: 16, weeklyWage: 25, contractLength: 5, nationality: 'England', flagUrl: '🇬🇧', isAcademy: true, imageColor: 'from-pink-500 to-rose-600' },
  { id: '20', name: 'Xavi Simons', shortName: 'Xavi Simons', position: 'MF', rating: 85, marketValue: 35, weeklyWage: 160, contractLength: 5, nationality: 'Netherlands', flagUrl: '🇳🇱', imageColor: 'from-orange-500 to-yellow-400' },
];

// Define visual coordinates on the pitch wrapper (in percentage width and height)
type PositionKey = 'GK' | 'LCB' | 'CB' | 'RCB' | 'LB' | 'RB' | 'LDM' | 'RDM' | 'LCM' | 'RCM' | 'CAM' | 'LW' | 'RW' | 'ST' | 'LWB' | 'RWB' | 'LM' | 'RM';

interface PitchSlot {
  key: PositionKey;
  label: string;
  role: 'GK' | 'DF' | 'MF' | 'FW';
  x: number; // Percentage from left
  y: number; // Percentage from top
}

const FORMATIONS: { [key: string]: PitchSlot[] } = {
  '4-3-3': [
    { key: 'GK', label: 'GK', role: 'GK', x: 50, y: 88 },
    { key: 'LB', label: 'LB', role: 'DF', x: 15, y: 68 },
    { key: 'LCB', label: 'CB', role: 'DF', x: 38, y: 72 },
    { key: 'RCB', label: 'CB', role: 'DF', x: 62, y: 72 },
    { key: 'RB', label: 'RB', role: 'DF', x: 85, y: 68 },
    { key: 'LCM', label: 'CM', role: 'MF', x: 32, y: 48 },
    { key: 'CB', label: 'CDM', role: 'MF', x: 50, y: 55 },
    { key: 'RCM', label: 'CM', role: 'MF', x: 68, y: 48 },
    { key: 'LW', label: 'LW', role: 'FW', x: 22, y: 22 },
    { key: 'ST', label: 'ST', role: 'FW', x: 50, y: 16 },
    { key: 'RW', label: 'RW', role: 'FW', x: 78, y: 22 },
  ],
  '3-4-2-1': [ // The Bayer 2025 Special Configuration
    { key: 'GK', label: 'GK', role: 'GK', x: 50, y: 88 },
    { key: 'LCB', label: 'CB', role: 'DF', x: 28, y: 72 },
    { key: 'CB', label: 'CB', role: 'DF', x: 50, y: 75 },
    { key: 'RCB', label: 'CB', role: 'DF', x: 72, y: 72 },
    { key: 'LWB', label: 'LWB', role: 'DF', x: 12, y: 48 },
    { key: 'LDM', label: 'CM', role: 'MF', x: 38, y: 52 },
    { key: 'RDM', label: 'CM', role: 'MF', x: 62, y: 52 },
    { key: 'RWB', label: 'RWB', role: 'DF', x: 88, y: 48 },
    { key: 'LCM', label: 'CAM', role: 'MF', x: 35, y: 28 },
    { key: 'RCM', label: 'CAM', role: 'MF', x: 65, y: 28 },
    { key: 'ST', label: 'ST', role: 'FW', x: 50, y: 14 },
  ],
  '4-2-3-1': [
    { key: 'GK', label: 'GK', role: 'GK', x: 50, y: 88 },
    { key: 'LB', label: 'LB', role: 'DF', x: 15, y: 68 },
    { key: 'LCB', label: 'CB', role: 'DF', x: 38, y: 72 },
    { key: 'RCB', label: 'CB', role: 'DF', x: 62, y: 72 },
    { key: 'RB', label: 'RB', role: 'DF', x: 85, y: 68 },
    { key: 'LDM', label: 'CDM', role: 'MF', x: 38, y: 54 },
    { key: 'RDM', label: 'CDM', role: 'MF', x: 62, y: 54 },
    { key: 'LM', label: 'LM', role: 'MF', x: 20, y: 32 },
    { key: 'CAM', label: 'CAM', role: 'MF', x: 50, y: 34 },
    { key: 'RM', label: 'RM', role: 'MF', x: 80, y: 32 },
    { key: 'ST', label: 'ST', role: 'FW', x: 50, y: 15 },
  ]
};

export default function PremiumLineupBuilder() {
  // Lineup representation where each key corresponds to a PositionKey
  // It records both the assigned Starter and an array of backups (Substitutes)
  interface PositionAssignments {
    [key: string]: {
      starterId: string | null;
      substituteIds: string[]; // Nested hierarchy ordered from top to bottom
    }
  }

  // Pre-seed some default starting values for the Tottenham roster
  const [selectedFormation, setSelectedFormation] = useState<string>('3-4-2-1');
  const [assignments, setAssignments] = useState<PositionAssignments>({
    GK: { starterId: '1', substituteIds: [] },
    LCB: { starterId: '18', substituteIds: ['12'] }, // Luka Vuskovic starting, Dragusin backup
    CB: { starterId: '2', substituteIds: [] }, // Cristian Romero
    RCB: { starterId: '3', substituteIds: ['17'] }, // Van de Ven starting, van Hecke backup
    LWB: { starterId: '4', substituteIds: [] }, // Destiny Udogie
    LDM: { starterId: '20', substituteIds: ['13'] }, // Xavi Simons starting, Archie Gray backup
    RDM: { starterId: '7', substituteIds: ['14'] }, // Pape Matar Sarr starting, Bergvall backup
    RWB: { starterId: '5', substituteIds: [] }, // Pedro Porro
    LCM: { starterId: '8', substituteIds: [] }, // James Maddison
    RCM: { starterId: '9', substituteIds: ['19'] }, // Son Heung-min starting, Mikey Moore backup
    ST: { starterId: '10', substituteIds: ['15', '16'] }, // Solanke starting, Richarlison and Johnson backups
  });

  // Financial Context baseline
  const revenue = 500; // £500m club revenue baseline
  const baseSpend = 230; // Base non-squad spend from accounting models

  // Search & Filter queries
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'GK' | 'DF' | 'MF' | 'FW'>('ALL');
  
  // Tactical Modal Controls
  const [activeConfigSlot, setActiveConfigSlot] = useState<PositionKey | null>(null);

  // Flatten starting XI and subs to figure out who is currently selected
  const occupiedStatus = useMemo(() => {
    const starters = new Set<string>();
    const subs = new Set<string>();
    
    Object.values(assignments).forEach(pos => {
      if (pos.starterId) starters.add(pos.starterId);
      pos.substituteIds.forEach(id => subs.add(id));
    });

    return { starters, subs };
  }, [assignments]);

  // Retrieve player records assigned as starting XI
  const activeLineupPlayers = useMemo(() => {
    return Object.entries(assignments).map(([posKey, value]) => {
      const p = INITIAL_ROSTER.find(x => x.id === value.starterId);
      return { posKey, player: p };
    }).filter(x => x.player !== undefined) as { posKey: PositionKey; player: Player }[];
  }, [assignments]);

  // Dynamically compute real-time wages and amortization logic for active assets
  const financialTotals = useMemo(() => {
    let activeWages = 0; // Cumulative active wages (£k)
    let activeAmortization = 0; // Cumulative active amortization (£m)

    // Calculate wages and amortization for any player registered anywhere in starting or backup roster
    const uniqueAssignedPlayerIds = new Set<string>();
    Object.values(assignments).forEach(pos => {
      if (pos.starterId) uniqueAssignedPlayerIds.add(pos.starterId);
      pos.substituteIds.forEach(id => uniqueAssignedPlayerIds.add(id));
    });

    uniqueAssignedPlayerIds.forEach(id => {
      const p = INITIAL_ROSTER.find(x => x.id === id);
      if (p) {
        activeWages += p.weeklyWage;
        // Amortization = Transfer value / Contract Length (if academy, amortization is £0)
        if (!p.isAcademy) {
          activeAmortization += (p.marketValue / Math.max(1, p.contractLength));
        }
      }
    });

    const annualWagesTotalM = (activeWages * 52) / 1000; // Convert wages to £m/yr
    const totalSquadCosts = baseSpend + annualWagesTotalM + activeAmortization;
    const squadCostRatio = (totalSquadCosts / revenue) * 100;

    return {
      annualWages: annualWagesTotalM,
      annualAmortization: activeAmortization,
      totalSquadCosts,
      squadCostRatio,
      activeWagesK: activeWages
    };
  }, [assignments]);

  // Update starting player slot
  const assignStarter = (slotKey: PositionKey, playerId: string | null) => {
    setAssignments(prev => {
      const updated = { ...prev };
      
      // If player is already starting/subbing somewhere else, clean up their old assignment first
      if (playerId) {
        Object.keys(updated).forEach(k => {
          if (updated[k].starterId === playerId) {
            updated[k] = { ...updated[k], starterId: null };
          }
          if (updated[k].substituteIds.includes(playerId)) {
            updated[k] = {
              ...updated[k],
              substituteIds: updated[k].substituteIds.filter(id => id !== playerId)
            };
          }
        });
      }

      // Preserve old starter if they need to be benched
      const oldStarter = updated[slotKey]?.starterId;

      updated[slotKey] = {
        ...updated[slotKey],
        starterId: playerId,
        // If there was an old starter and no current backup, push the old starter to backups to be neat
        substituteIds: oldStarter && oldStarter !== playerId && !updated[slotKey]?.substituteIds.includes(oldStarter)
          ? [...(updated[slotKey]?.substituteIds || []), oldStarter]
          : (updated[slotKey]?.substituteIds || []).filter(id => id !== playerId)
      };

      return updated;
    });
  };

  // Add backup Substitute to specific starting slot
  const addSubstitute = (slotKey: PositionKey, playerId: string) => {
    setAssignments(prev => {
      const updated = { ...prev };

      // Clean up previous registration anywhere else
      Object.keys(updated).forEach(k => {
        if (updated[k].starterId === playerId) {
          updated[k] = { ...updated[k], starterId: null };
        }
        if (updated[k].substituteIds.includes(playerId)) {
          updated[k] = {
            ...updated[k],
            substituteIds: updated[k].substituteIds.filter(id => id !== playerId)
          };
        }
      });

      const currentSubs = updated[slotKey]?.substituteIds || [];
      if (!currentSubs.includes(playerId)) {
        updated[slotKey] = {
          ...updated[slotKey],
          substituteIds: [...currentSubs, playerId]
        };
      }

      return updated;
    });
  };

  // Remove backup or starter entirely
  const removePlayerFromSlot = (slotKey: PositionKey, playerId: string, isStarter: boolean) => {
    setAssignments(prev => {
      const updated = { ...prev };
      if (isStarter) {
        updated[slotKey] = {
          ...updated[slotKey],
          starterId: null
        };
      } else {
        updated[slotKey] = {
          ...updated[slotKey],
          substituteIds: updated[slotKey].substituteIds.filter(id => id !== playerId)
        };
      }
      return updated;
    });
  };

  // Auto-fill optimization logic
  const autoFillBestXI = () => {
    const sortedAvailable = [...INITIAL_ROSTER].sort((a, b) => b.rating - a.rating);
    const slots = FORMATIONS[selectedFormation];
    const newAssignments: PositionAssignments = {};

    slots.forEach((slot, index) => {
      const candidateIndex = sortedAvailable.findIndex(p => p.position === slot.role);
      if (candidateIndex !== -1) {
        const [foundPlayer] = sortedAvailable.splice(candidateIndex, 1);
        newAssignments[slot.key] = {
          starterId: foundPlayer.id,
          substituteIds: []
        };
      } else {
        newAssignments[slot.key] = { starterId: null, substituteIds: [] };
      }
    });

    // Populate leftover players as backups
    slots.forEach(slot => {
      if (sortedAvailable.length > 0) {
        const subIndex = sortedAvailable.findIndex(p => p.position === slot.role);
        if (subIndex !== -1) {
          const [subPlayer] = sortedAvailable.splice(subIndex, 1);
          newAssignments[slot.key].substituteIds.push(subPlayer.id);
        }
      }
    });

    setAssignments(newAssignments);
  };

  // Clear pitch cleanly
  const clearPitch = () => {
    const cleared: PositionAssignments = {};
    FORMATIONS[selectedFormation].forEach(slot => {
      cleared[slot.key] = { starterId: null, substituteIds: [] };
    });
    setAssignments(cleared);
  };

  const filteredRoster = useMemo(() => {
    return INITIAL_ROSTER.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.nationality.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || p.position === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [searchQuery, roleFilter]);

  // Current list of slots based on user formation setting
  const activeFormationSlots = FORMATIONS[selectedFormation] || FORMATIONS['3-4-2-1'];

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#090b11] text-white overflow-hidden font-sans">
      
      {}
      <div className="w-full lg:w-96 flex flex-col border-r border-[#1a1f2e] bg-[#0c0f17] shrink-0 overflow-y-auto">
        <div className="p-6 border-b border-[#1a1f2e]">
          <div className="flex items-center gap-2 mb-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight">Spurs SCR Builder</h1>
          </div>
          <p className="text-xs text-gray-400">EPL Financial Compliance & Amortization Sandbox</p>
        </div>

        {/* Dynamic Financial Sustainability Gauges */}
        <div className="p-6 space-y-5 border-b border-[#1a1f2e] bg-[#0e121d]">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400" /> Compliance Status
          </h2>

          {/* Core Gauge Ratio Display */}
          <div>
            <div className="flex justify-between items-end mb-1.5">
              <span className="text-xs text-gray-400">Squad Cost Ratio</span>
              <span className={`text-lg font-bold ${
                financialTotals.squadCostRatio <= 70 ? 'text-emerald-400' :
                financialTotals.squadCostRatio <= 85 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {financialTotals.squadCostRatio.toFixed(1)}%
              </span>
            </div>
            
            {/* Visual Progress Bar */}
            <div className="h-2.5 w-full bg-[#1b2234] rounded-full overflow-hidden relative">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  financialTotals.squadCostRatio <= 70 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' :
                  financialTotals.squadCostRatio <= 85 ? 'bg-gradient-to-r from-yellow-500 to-amber-400 animate-pulse' : 
                  'bg-gradient-to-r from-red-500 to-rose-600 animate-pulse'
                }`}
                style={{ width: `${Math.min(100, financialTotals.squadCostRatio)}%` }}
              />
              {/* Target Limit Indicators */}
              <div className="absolute top-0 bottom-0 left-[70%] w-0.5 bg-sky-500/50" title="UEFA 70% Limit" />
              <div className="absolute top-0 bottom-0 left-[85%] w-0.5 bg-red-500/50" title="EPL 85% Limit" />
            </div>

            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>0%</span>
              <span className="text-sky-400 font-semibold">UEFA (70%)</span>
              <span className="text-amber-400 font-semibold">EPL (85%)</span>
              <span>100%</span>
            </div>
          </div>

          {/* Compliance Status Card */}
          <div className={`p-4 rounded-xl border flex gap-3 ${
            financialTotals.squadCostRatio <= 70 
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' 
              : financialTotals.squadCostRatio <= 85 
              ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-300'
              : 'bg-red-500/5 border-red-500/20 text-red-300'
          }`}>
            <div className="p-2 rounded-lg bg-black/25 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm">
                {financialTotals.squadCostRatio <= 70 ? 'Fully Compliant (UEFA Zone)' :
                 financialTotals.squadCostRatio <= 85 ? 'Domestic Safe (EPL Zone)' : 'REGULATORY BREACH RISK'}
              </div>
              <div className="text-xs opacity-80">
                {financialTotals.squadCostRatio <= 70 ? 'Eligible for Champions League registrations.' :
                 financialTotals.squadCostRatio <= 85 ? 'Triggers domestic Luxury Tax but compliant with standard limits.' :
                 'Exceeds standard 85% limit. This plan likely requires cost mitigation.'}
              </div>
            </div>
          </div>

          {/* Asset Math Breakdown */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-black/20 p-3 rounded-xl border border-[#1d2436]">
            <div>
              <span className="text-gray-400 block">Squad Costs:</span>
              <span className="font-semibold text-gray-200">£{financialTotals.totalSquadCosts.toFixed(1)}m</span>
            </div>
            <div>
              <span className="text-gray-400 block">Annual Wages:</span>
              <span className="font-semibold text-gray-200">£{financialTotals.annualWages.toFixed(1)}m</span>
            </div>
            <div className="mt-2 pt-2 border-t border-[#1d2436]">
              <span className="text-gray-400 block">Amortization:</span>
              <span className="font-semibold text-gray-200">£{financialTotals.annualAmortization.toFixed(1)}m</span>
            </div>
            <div className="mt-2 pt-2 border-t border-[#1d2436]">
              <span className="text-gray-400 block">Active Wage/wk:</span>
              <span className="font-semibold text-gray-200">£{financialTotals.activeWagesK}k</span>
            </div>
          </div>
        </div>

        {/* Formations and Global Board Toggles */}
        <div className="p-6 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Tactical Board Controls
          </h2>

          {/* Formations Dropdown/Button Grid */}
          <div className="space-y-2">
            <label className="text-xs text-gray-400">Select Board Layout</label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.keys(FORMATIONS).map(form => (
                <button
                  key={form}
                  onClick={() => setSelectedFormation(form)}
                  className={`px-2 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    selectedFormation === form
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                      : 'bg-[#121622] border-[#1d2436] text-gray-400 hover:text-white hover:bg-[#1a1f2e]'
                  }`}
                >
                  {form}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="pt-3 flex gap-2">
            <button
              onClick={autoFillBestXI}
              className="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-lg flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-600/10"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto-fill Best XI
            </button>
            <button
              onClick={clearPitch}
              className="px-4 py-2 text-xs font-semibold bg-[#121622] border border-[#1d2436] hover:bg-red-900/10 hover:border-red-500/20 hover:text-red-400 rounded-lg flex items-center justify-center transition"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {}
      <div className="flex-1 flex flex-col relative bg-[#0b0d15]">
        
        {/* Secondary Header Bar inside pitch */}
        <div className="px-6 py-4 border-b border-[#1a1f2e]/50 flex items-center justify-between bg-[#0e111b]/80 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Tottenham Hotspur — Interactive Sandbox</span>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold uppercase tracking-wider">
              {selectedFormation}
            </span>
          </div>
          <div className="text-xs text-gray-400">
            Assigned: <span className="font-bold text-gray-200">{occupiedStatus.starters.size} / 11 Players</span>
          </div>
        </div>

        {/* THE PITCH WRAPPER */}
        <div className="flex-1 relative flex items-center justify-center p-4 lg:p-8 overflow-hidden select-none">
          {/* Depth field graphic matching image_a599c3.jpg */}
          <div className="w-full max-w-4xl h-full max-h-[85vh] relative rounded-3xl overflow-hidden shadow-2xl border border-emerald-500/20 bg-gradient-to-b from-[#132220] via-[#0b1614] to-[#05090a] flex items-center justify-center">
            
            {/* Glossy radial spotlight overlay behind the pitch */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent pointer-events-none" />

            {/* Stadium Pitch Markings */}
            <div className="absolute inset-x-6 inset-y-6 border border-emerald-500/10 rounded-2xl pointer-events-none flex flex-col justify-between">
              
              {/* Outer Goal Boxes & Halves */}
              <div className="h-1/2 w-full border-b border-emerald-500/10 relative">
                
                {/* Penalty Area Top */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[50%] h-[30%] border-x border-b border-emerald-500/10 flex justify-center">
                  {/* Goal Area Top */}
                  <div className="w-[40%] h-[35%] border-x border-b border-emerald-500/10" />
                </div>
                {/* Penalty Arc Top */}
                <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[18%] h-[12%] border-b border-emerald-500/10 rounded-b-full" />
              </div>

              {/* Center Circle */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[22%] aspect-square border border-emerald-500/10 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-emerald-500/20 rounded-full" />
              </div>

              <div className="h-1/2 w-full relative">
                {/* Penalty Area Bottom */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[50%] h-[30%] border-x border-t border-emerald-500/10 flex items-center justify-center">
                  {/* Goal Area Bottom */}
                  <div className="w-[40%] h-[35%] border-x border-t border-emerald-500/10 absolute bottom-0" />
                </div>
                {/* Penalty Arc Bottom */}
                <div className="absolute bottom-[30%] left-1/2 -translate-x-1/2 w-[18%] h-[12%] border-t border-emerald-500/10 rounded-t-full" />
              </div>
            </div>

            {}
            {activeFormationSlots.map(slot => {
              const assignment = assignments[slot.key];
              const starter = INITIAL_ROSTER.find(p => p.id === assignment?.starterId);
              // Retrieve the first Substitute backup designated for this position
              const backupId = assignment?.substituteIds?.[0];
              const primaryBackup = INITIAL_ROSTER.find(p => p.id === backupId);
              const totalBackups = assignment?.substituteIds?.length || 0;

              return (
                <div
                  key={slot.key}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center group"
                >
                  {/* Tactical circle container */}
                  <div 
                    onClick={() => setActiveConfigSlot(slot.key)}
                    className="relative cursor-pointer transition-transform duration-300 transform group-hover:scale-105"
                  >
                    
                    {/* Position Label Tag */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/80 border border-indigo-500/30 text-[9px] font-bold tracking-widest text-indigo-400 z-20">
                      {slot.label}
                    </div>

                    {/* Circular Avatar Window matching image_a599c3.jpg style */}
                    <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full p-0.5 bg-gradient-to-b ${
                      starter ? 'from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/25' : 'from-gray-700/30 to-gray-800/10'
                    }`}>
                      <div className="w-full h-full rounded-full bg-[#0d121c] flex flex-col items-center justify-center overflow-hidden relative">
                        {starter ? (
                          <>
                            {/* Stylized background color for player */}
                            <div className={`absolute inset-0 bg-gradient-to-tr ${starter.imageColor} opacity-20`} />
                            {/* Initials fallback stylized profile */}
                            <div className="text-sm font-bold text-white z-10 mt-3 flex flex-col items-center">
                              <span className="text-xs">{starter.flagUrl}</span>
                              <span className="tracking-wide text-xs mt-0.5 font-black uppercase text-gray-200">
                                {starter.shortName.slice(0, 8)}
                              </span>
                            </div>
                            <div className="absolute bottom-1.5 text-[9px] font-bold text-emerald-400 bg-black/60 px-1 py-0.2 rounded z-20">
                              ★ {starter.rating}
                            </div>
                          </>
                        ) : (
                          <Plus className="w-5 h-5 text-gray-500 group-hover:text-gray-300 transition-colors" />
                        )}
                      </div>
                    </div>

                    {/* Glowing outer aura for assigned starting players */}
                    {starter && (
                      <span className="absolute inset-0 rounded-full border border-emerald-400/40 animate-ping opacity-25 pointer-events-none" />
                    )}
                  </div>

                  {/* NESTED POSITION-LINKED BACKUP PILLS (Bayer Lineup Style) */}
                  <div className="mt-2 flex flex-col items-center gap-1 w-24">
                    {starter && (
                      <div className="px-2 py-0.5 bg-black/80 border border-[#232a3d] text-gray-200 text-[10px] font-medium rounded text-center truncate max-w-full">
                        {starter.name.split(' ').pop()}
                      </div>
                    )}
                    
                    {/* Substitute Sub-badge Indicator */}
                    {starter && (
                      <div 
                        onClick={() => setActiveConfigSlot(slot.key)}
                        className="cursor-pointer max-w-full"
                      >
                        {primaryBackup ? (
                          <div className="px-2 py-0.5 bg-[#121622] hover:bg-[#1a2033] border border-cyan-500/20 text-[9px] text-cyan-300 rounded-full flex items-center justify-center gap-1 font-bold shadow-sm transition">
                            <RefreshCw className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                            <span className="truncate max-w-[55px]">{primaryBackup.shortName}</span>
                            {totalBackups > 1 && (
                              <span className="text-[8px] px-1 bg-cyan-900/40 text-cyan-200 rounded">
                                +{totalBackups - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="px-2 py-0.5 bg-black/40 border border-[#1b2234] hover:bg-black/60 text-[8px] text-gray-500 rounded-full flex items-center justify-center gap-0.5 transition">
                            <Plus className="w-2 h-2" /> Add sub
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              );
            })}

          </div>
        </div>
      </div>

      {}
      <div className="w-full lg:w-96 border-l border-[#1a1f2e] bg-[#0c0f17] flex flex-col overflow-hidden">
        
        {/* Roster Header */}
        <div className="p-6 border-b border-[#1a1f2e] shrink-0">
          <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-indigo-400" /> Tottenham Hotspur Squad
          </h2>

          {/* Search Inputs */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-[#121622] border border-[#1d2436] focus:border-indigo-500 text-white placeholder-gray-500 rounded-lg outline-none transition"
            />
          </div>

          {/* Role filter buttons */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {['ALL', 'GK', 'DF', 'MF', 'FW'].map(role => (
              <button
                key={role}
                onClick={() => setRoleFilter(role as 'ALL' | 'GK' | 'DF' | 'MF' | 'FW')}
                className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${
                  roleFilter === role
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                    : 'bg-black/25 text-gray-400 hover:text-white hover:bg-[#121622] border border-transparent'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        {/* Squad Pool List view */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredRoster.map(player => {
            const isStarting = occupiedStatus.starters.has(player.id);
            const isSub = occupiedStatus.subs.has(player.id);

            return (
              <div
                key={player.id}
                className={`p-3 rounded-xl border flex items-center justify-between transition-all group ${
                  isStarting 
                    ? 'bg-emerald-950/10 border-emerald-500/20 shadow-sm' 
                    : isSub 
                    ? 'bg-cyan-950/10 border-cyan-500/20'
                    : 'bg-[#101420] border-[#1d2436]/60 hover:bg-[#141a2a] hover:border-[#2b3550]'
                }`}
              >
                {/* Left Side: Avatar, name, position, flag */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-lg p-0.5 bg-gradient-to-b ${player.imageColor}`}>
                    <div className="w-full h-full rounded-[6px] bg-[#0c0f17] flex items-center justify-center text-sm">
                      {player.flagUrl}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-200 truncate flex items-center gap-1.5">
                      <span>{player.name}</span>
                      {player.isAcademy && (
                        <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 py-0.1 rounded font-black uppercase">
                          Acad
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                      <span className="font-bold text-indigo-400 uppercase">{player.position}</span>
                      <span>•</span>
                      <span>Rating: <span className="text-gray-200 font-semibold">{player.rating}</span></span>
                      <span>•</span>
                      <span>Amort: <span className="text-gray-200 font-semibold">£{(player.isAcademy ? 0 : player.marketValue / player.contractLength).toFixed(1)}m</span></span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Quick Slot Assignment dropdown */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right mr-1.5 hidden sm:block">
                    <span className="text-xs font-bold text-gray-200">£{player.weeklyWage}k</span>
                    <span className="block text-[8px] text-gray-400">weekly wage</span>
                  </div>

                  {isStarting ? (
                    <span className="px-2 py-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded">
                      STARTER
                    </span>
                  ) : isSub ? (
                    <span className="px-2 py-1 text-[9px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded">
                      SUBSTITUTE
                    </span>
                  ) : (
                    <div className="relative">
                      {/* Interactive click quick menu */}
                      <button
                        onClick={() => {
                          // Find first unfilled slot that matches the player's role, or fall back to any slot
                          const matchingSlot = activeFormationSlots.find(s => s.role === player.position && !assignments[s.key].starterId);
                          const targetSlot = matchingSlot || activeFormationSlots[0];
                          if (targetSlot) {
                            assignStarter(targetSlot.key, player.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-[#192033] hover:bg-indigo-600 border border-[#232c45] hover:border-indigo-500 text-gray-300 hover:text-white transition"
                        title="Auto-assign to Pitch"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {}
      {activeConfigSlot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg bg-[#0e121d] rounded-2xl border border-[#232a3d] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-[#232a3d] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-200 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  Configure Slot: <span className="text-indigo-400">{activeConfigSlot}</span>
                </h3>
                <p className="text-xs text-gray-400">Manage starter and hierarchal backups</p>
              </div>
              <button 
                onClick={() => setActiveConfigSlot(null)}
                className="p-1.5 rounded-lg bg-[#192033] hover:bg-[#232c45] text-gray-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              {/* SECTION A: Current Starter Selection */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Current Starter</h4>
                {assignments[activeConfigSlot]?.starterId ? (
                  (() => {
                    const starter = INITIAL_ROSTER.find(x => x.id === assignments[activeConfigSlot].starterId);
                    if (!starter) return null;
                    return (
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{starter.flagUrl}</span>
                          <div>
                            <div className="text-xs font-bold text-gray-200">{starter.name}</div>
                            <div className="text-[10px] text-gray-400">Rating: {starter.rating} • Wage: £{starter.weeklyWage}k</div>
                          </div>
                        </div>
                        <button
                          onClick={() => removePlayerFromSlot(activeConfigSlot, starter.id, true)}
                          className="p-1.5 rounded-lg bg-red-950/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-900/20 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  <div className="p-4 bg-black/20 border border-[#232a3d] border-dashed rounded-xl text-center text-xs text-gray-500">
                    No starter assigned to this position.
                  </div>
                )}
              </div>

              {/* SECTION B: Sub Stack Backups Hierarchy */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center justify-between">
                  <span>Backups Hierarchy (Substitutes)</span>
                  <span className="text-[10px] text-gray-500 capitalize">Top backup is main sub</span>
                </h4>
                
                {assignments[activeConfigSlot]?.substituteIds.length > 0 ? (
                  <div className="space-y-2">
                    {assignments[activeConfigSlot].substituteIds.map((subId, index) => {
                      const subPlayer = INITIAL_ROSTER.find(x => x.id === subId);
                      if (!subPlayer) return null;
                      return (
                        <div 
                          key={subId}
                          className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/50 text-cyan-400 font-black border border-cyan-500/10">
                              Sub {index + 1}
                            </span>
                            <div>
                              <div className="text-xs font-bold text-gray-200">{subPlayer.name}</div>
                              <div className="text-[10px] text-gray-400">Rating: {subPlayer.rating} • Wage: £{subPlayer.weeklyWage}k</div>
                            </div>
                          </div>
                          <button
                            onClick={() => removePlayerFromSlot(activeConfigSlot, subId, false)}
                            className="p-1.5 rounded-lg bg-red-950/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-900/20 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-black/20 border border-[#232a3d] border-dashed rounded-xl text-center text-xs text-gray-500">
                    No substitute backups registered for this spot.
                  </div>
                )}
              </div>

              {/* SECTION C: Quick Add Panel */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Assign from Available Pool</h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {INITIAL_ROSTER.filter(p => p.id !== assignments[activeConfigSlot]?.starterId && !assignments[activeConfigSlot]?.substituteIds.includes(p.id))
                    .map(player => (
                      <div 
                        key={player.id} 
                        className="p-2.5 bg-[#121622] hover:bg-[#181d2e] border border-[#1d2436]/60 rounded-lg flex items-center justify-between text-xs"
                      >
                        <span className="font-medium text-gray-200">
                          {player.name} <span className="text-indigo-400 text-[10px] ml-1 uppercase">{player.position}</span>
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => assignStarter(activeConfigSlot, player.id)}
                            className="px-2 py-1 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white text-emerald-400 text-[10px] font-bold rounded"
                          >
                            Set Starter
                          </button>
                          <button
                            onClick={() => addSubstitute(activeConfigSlot, player.id)}
                            className="px-2 py-1 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600 hover:text-white text-cyan-400 text-[10px] font-bold rounded"
                          >
                            Set Sub
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#0a0d15] border-t border-[#232a3d] flex justify-end">
              <button
                onClick={() => setActiveConfigSlot(null)}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
              >
                Close & Save Changes
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}