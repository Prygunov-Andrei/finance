import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { useQuery } from '@tanstack/react-query';
import { api, LegalEntity, OrgChartData } from '../lib/api';
import { useLegalEntities } from '../hooks';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Loader2, Users, Building2, UserCircle } from 'lucide-react';

// =====================================================================
// DAGRE LAYOUT
// =====================================================================

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// =====================================================================
// CUSTOM NODE
// =====================================================================

interface EmployeeNodeData {
  label: string;
  position: string;
  legalEntities: string[];
  isActive: boolean;
  [key: string]: unknown;
}

const EmployeeNode = ({ data }: { data: EmployeeNodeData }) => {
  return (
    <div
      className={`
        px-4 py-3 rounded-xl border-2 shadow-sm min-w-[200px]
        ${data.isActive
          ? 'bg-white border-blue-300 hover:border-blue-500'
          : 'bg-gray-100 border-gray-300 opacity-60'}
        transition-colors
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-400 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <UserCircle className="w-8 h-8 text-blue-500 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">{data.label}</p>
          <p className="text-xs text-gray-500 truncate">{data.position || 'Без должности'}</p>
          {data.legalEntities.length > 0 && (
            <p className="text-[10px] text-blue-600 truncate mt-0.5">
              {data.legalEntities.join(', ')}
            </p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-2 !h-2" />
    </div>
  );
};

const nodeTypes = { employee: EmployeeNode };

// =====================================================================
// ORG CHART COMPONENT
// =====================================================================

export function OrgChart() {
  const [filterLegalEntity, setFilterLegalEntity] = useState<string>('all');
  const { data: legalEntities = [] } = useLegalEntities();

  const { data: orgData, isLoading } = useQuery<OrgChartData>({
    queryKey: ['org-chart', filterLegalEntity],
    queryFn: () =>
      api.getOrgChart(filterLegalEntity !== 'all' ? Number(filterLegalEntity) : undefined),
  });

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!orgData) return { initialNodes: [], initialEdges: [] };

    const rawNodes: Node[] = orgData.nodes.map((n) => ({
      id: String(n.id),
      type: 'employee',
      position: { x: 0, y: 0 },
      data: {
        label: n.full_name,
        position: n.current_position,
        legalEntities: n.legal_entities.map((le) => le.short_name),
        isActive: n.is_active,
      } as EmployeeNodeData,
    }));

    const rawEdges: Edge[] = orgData.edges.map((e, idx) => ({
      id: `e-${e.source}-${e.target}`,
      source: String(e.source),
      target: String(e.target),
      type: 'smoothstep',
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    }));

    const { nodes: layouted, edges } = getLayoutedElements(rawNodes, rawEdges);
    return { initialNodes: layouted, initialEdges: edges };
  }, [orgData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!orgData || orgData.nodes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">Нет данных для отображения</p>
        <p className="text-sm">Добавьте сотрудников и настройте иерархию подчинения</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filterLegalEntity} onValueChange={setFilterLegalEntity}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Фильтр по юр. лицу" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все юр. лица</SelectItem>
            {legalEntities.map((le: LegalEntity) => (
              <SelectItem key={le.id} value={String(le.id)}>
                {le.short_name || le.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">
          {orgData.nodes.length} сотрудников, {orgData.edges.length} связей
        </span>
      </div>

      <div className="border rounded-xl overflow-hidden" style={{ height: '600px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          attributionPosition="bottom-left"
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
