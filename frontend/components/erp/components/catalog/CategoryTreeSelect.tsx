import { CategoryTreeNode } from '../../types/catalog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface CategoryTreeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  categories: CategoryTreeNode[];
  placeholder?: string;
  className?: string;
}

export function CategoryTreeSelect({
  value,
  onValueChange,
  categories,
  placeholder = 'Все категории',
  className,
}: CategoryTreeSelectProps) {
  // Рекурсивно преобразуем дерево в плоский список с отступами
  const flattenTree = (
    nodes: CategoryTreeNode[],
    level: number = 0
  ): Array<{ id: number; name: string; level: number }> => {
    const result: Array<{ id: number; name: string; level: number }> = [];
    
    for (const node of nodes) {
      result.push({ id: node.id, name: node.name, level });
      
      if (node.children && node.children.length > 0) {
        result.push(...flattenTree(node.children, level + 1));
      }
    }
    
    return result;
  };

  const flatCategories = flattenTree(categories);

  return (
    <Select
      value={value || "all"}
      onValueChange={(val) => onValueChange(val === "all" ? "" : val)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {flatCategories.map((cat) => (
          <SelectItem key={cat.id} value={cat.id.toString()}>
            <span style={{ paddingLeft: `${cat.level * 16}px` }}>
              {cat.level > 0 && '└ '}
              {cat.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}