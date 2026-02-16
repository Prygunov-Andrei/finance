import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { FrontOfWorkItems } from '../proposals/FrontOfWorkItems';
import { MountingConditions } from '../proposals/MountingConditions';

export const WorkConditionsPage = () => {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Фронт работ и монтажные условия</h1>
      <Tabs defaultValue="front-of-work" className="w-full">
        <TabsList>
          <TabsTrigger value="front-of-work">Фронт работ</TabsTrigger>
          <TabsTrigger value="mounting-conditions">Условия для МП</TabsTrigger>
        </TabsList>
        <TabsContent value="front-of-work">
          <FrontOfWorkItems />
        </TabsContent>
        <TabsContent value="mounting-conditions">
          <MountingConditions />
        </TabsContent>
      </Tabs>
    </div>
  );
};
