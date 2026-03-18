import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ParentCrumb {
  label: string;
  path: string;
}

interface BreadcrumbContextValue {
  detailLabel: string | null;
  setDetailLabel: (label: string | null) => void;
  parentCrumb: ParentCrumb | null;
  setParentCrumb: (crumb: ParentCrumb | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  detailLabel: null,
  setDetailLabel: () => {},
  parentCrumb: null,
  setParentCrumb: () => {},
});

export const BreadcrumbProvider = ({ children }: { children: ReactNode }) => {
  const [detailLabel, setDetailLabelState] = useState<string | null>(null);
  const [parentCrumb, setParentCrumbState] = useState<ParentCrumb | null>(null);

  const setDetailLabel = useCallback((label: string | null) => {
    setDetailLabelState(label);
  }, []);

  const setParentCrumb = useCallback((crumb: ParentCrumb | null) => {
    setParentCrumbState(crumb);
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ detailLabel, setDetailLabel, parentCrumb, setParentCrumb }}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

export const useBreadcrumb = () => useContext(BreadcrumbContext);
