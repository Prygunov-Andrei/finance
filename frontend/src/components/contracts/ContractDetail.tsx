import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { CreateContractDialog } from '../CreateContractDialog';
import { ContractAmendmentsTab } from '../ContractAmendmentsTab';
import { formatDate, formatAmount, formatCurrency } from '../../lib/utils';
import { CONSTANTS, COLORS } from '../../constants';

type TabType = 'info' | 'amendments' | 'schedule' | 'acts' | 'cashflow';

export function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Загрузка договора
  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract', id],
    queryFn: () => api.getContract(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Загрузка баланса
  const { data: balance } = useQuery({
    queryKey: ['contract-balance', id],
    queryFn: () => api.getContractBalance(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Загрузка маржи (только для доходных договоров)
  const { data: margin } = useQuery({
    queryKey: ['contract-margin', id],
    queryFn: () => api.getContractMargin(parseInt(id!)),
    enabled: !!id && contract?.contract_type === 'income',
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Удаление договора
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteContract(parseInt(id!)),
    onSuccess: () => {
      toast.success('Договор удалён');
      navigate('/contracts');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleDelete = () => {
    if (confirm(`Вы уверены, что хотите удалить договор "${contract?.name}"?`)) {
      deleteMutation.mutate();
    }
  };

  const getStatusBadge = (status: string) => {
    const config = {
      planned: { label: 'Планируется', className: 'bg-gray-100 text-gray-800' },
      active: { label: 'В работе', className: 'bg-green-100 text-green-800' },
      completed: { label: 'Завершён', className: 'bg-blue-100 text-blue-800' },
      suspended: { label: 'Приостановлен', className: 'bg-orange-100 text-orange-800' },
      terminated: { label: 'Расторгнут', className: 'bg-red-100 text-red-800' },
    };
    const item = config[status as keyof typeof config] || config.planned;
    return <Badge className={item.className}>{item.label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    return type === 'income' ? (
      <Badge className="bg-green-100 text-green-800">Доходный</Badge>
    ) : (
      <Badge className="bg-red-100 text-red-800">Расходный</Badge>
    );
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-gray-500">Договор не найден</div>
        <Button onClick={() => navigate('/contracts')} className="mt-4">
          Вернуться к списку
        </Button>
      </div>
    );
  }

  const balanceColor = balance ? (
    parseFloat(balance.balance) > 0 ? 'text-green-600' : 
    parseFloat(balance.balance) < 0 ? 'text-red-600' : 
    'text-gray-600'
  ) : 'text-gray-600';

  return (
    <div className="space-y-6">
      {/* Хедер */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <Button
              onClick={() => navigate('/contracts')}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-gray-900">{contract.name}</h1>
                {getStatusBadge(contract.status)}
                {getTypeBadge(contract.contract_type)}
              </div>
              <div className="flex items-center gap-4 text-gray-600">
                <span>№ {contract.number}</span>
                <span>от {formatDate(contract.contract_date)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setIsEditDialogOpen(true)}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Редактировать
            </Button>
            <Button
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Панель информации */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">Объект</div>
            <div className="text-gray-900">{contract.object_name}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">Контрагент</div>
            <div className="text-gray-900">{contract.counterparty_name}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">Сумма договора</div>
            <div className="text-blue-900">{formatCurrency(contract.total_amount, contract.currency)}</div>
          </div>
          {balance && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-gray-600 mb-1">Баланс</div>
              <div className={balanceColor}>{formatCurrency(balance.balance, balance.currency)}</div>
            </div>
          )}
          {margin && contract.contract_type === 'income' && (
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-gray-600 mb-1">Маржа</div>
              <div className="text-green-900">
                {formatCurrency(margin.margin, contract.currency)} ({parseFloat(margin.margin_percent).toFixed(2)}%)
              </div>
            </div>
          )}
          {contract.start_date && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-gray-600 mb-1">Срок работ</div>
              <div className="text-gray-900">
                {formatDate(contract.start_date)} - {contract.end_date ? formatDate(contract.end_date) : 'не указано'}
              </div>
            </div>
          )}
          {contract.framework_contract_details && (
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-gray-600 mb-1">Рамочный договор</div>
              <div
                onClick={() => navigate(`/contracts/framework-contracts/${contract.framework_contract}`)}
                className="text-purple-900 cursor-pointer hover:underline"
              >
                {contract.framework_contract_details.number}
              </div>
            </div>
          )}
        </div>

        {/* Вкладки */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'info'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Основное
          </button>
          <button
            onClick={() => setActiveTab('amendments')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'amendments'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Доп. соглашения
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'schedule'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            График работ
          </button>
          <button
            onClick={() => setActiveTab('acts')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'acts'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Акты
          </button>
          <button
            onClick={() => setActiveTab('cashflow')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'cashflow'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Cash-flow
          </button>
        </div>
      </div>

      {/* Контент вкладок */}
      {activeTab === 'info' && <InfoTab contract={contract} />}
      {activeTab === 'amendments' && <ContractAmendmentsTab contractId={contract.id} />}
      {activeTab === 'schedule' && <WorkScheduleTab contractId={contract.id} />}
      {activeTab === 'acts' && <ActsTab contractId={contract.id} />}
      {activeTab === 'cashflow' && <CashFlowTab contractId={contract.id} />}

      {/* Диалог редактирования */}
      <CreateContractDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        contract={contract}
      />
    </div>
  );
}

// Заглушка для вкладки "Основное"
function InfoTab({ contract }: { contract: ContractDetailType }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-gray-900 mb-4">Основная информация</h2>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-gray-600">Номер</div>
          <div className="text-gray-900 mt-1">{contract.number}</div>
        </div>
        <div>
          <div className="text-gray-600">Название</div>
          <div className="text-gray-900 mt-1">{contract.name}</div>
        </div>
        <div>
          <div className="text-gray-600">Дата заключения</div>
          <div className="text-gray-900 mt-1">{formatDate(contract.contract_date)}</div>
        </div>
        <div>
          <div className="text-gray-600">Компания</div>
          <div className="text-gray-900 mt-1">{contract.legal_entity_name}</div>
        </div>
        <div>
          <div className="text-gray-600">Контрагент</div>
          <div className="text-gray-900 mt-1">{contract.counterparty_name}</div>
        </div>
        <div>
          <div className="text-gray-600">Объект</div>
          <div className="text-gray-900 mt-1">{contract.object_name}</div>
        </div>
        {contract.technical_proposal_number && (
          <div>
            <div className="text-gray-600">ТКП</div>
            <div className="text-gray-900 mt-1">{contract.technical_proposal_number}</div>
          </div>
        )}
        {contract.mounting_proposal_number && (
          <div>
            <div className="text-gray-600">МП</div>
            <div className="text-gray-900 mt-1">{contract.mounting_proposal_number}</div>
          </div>
        )}
        {contract.responsible_manager_name && (
          <div>
            <div className="text-gray-600">Начальник участка</div>
            <div className="text-gray-900 mt-1">{contract.responsible_manager_name}</div>
          </div>
        )}
        {contract.responsible_engineer_name && (
          <div>
            <div className="text-gray-600">Ответственный инженер</div>
            <div className="text-gray-900 mt-1">{contract.responsible_engineer_name}</div>
          </div>
        )}
        {contract.file && (
          <div>
            <div className="text-gray-600">Файл договора</div>
            <a
              href={contract.file}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-2 mt-1"
            >
              <FileText className="w-4 h-4" />
              Открыть файл
            </a>
          </div>
        )}
        {contract.notes && (
          <div className="col-span-2">
            <div className="text-gray-600">Примечания</div>
            <div className="text-gray-900 mt-1 whitespace-pre-wrap">{contract.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Компонент вкладки Cash-flow
function CashFlowTab({ contractId }: { contractId: number }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodType, setPeriodType] = useState<'month' | 'week' | 'day'>('month');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  // Загрузка данных cash-flow по периодам
  const { data: cashFlow, isLoading } = useQuery({
    queryKey: ['contract-cashflow', contractId, periodType, startDate, endDate],
    queryFn: () => api.getContractCashFlowPeriods(contractId, { 
      period_type: periodType,
      start_date: startDate || undefined, 
      end_date: endDate || undefined 
    }),
    enabled: !!contractId,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const cashFlowData = Array.isArray(cashFlow) ? cashFlow : [];

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-gray-900 mb-6">Cash-flow по периодам</h2>

      {/* Фильтры */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-gray-600 mb-2">Период</label>
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as 'month' | 'week' | 'day')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="month">Месяц</option>
            <option value="week">Неделя</option>
            <option value="day">День</option>
          </select>
        </div>
        <div>
          <label className="block text-gray-600 mb-2">Дата начала</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-gray-600 mb-2">Дата окончания</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-gray-600 mb-2">Тип графика</label>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as 'line' | 'bar')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="line">Линейный</option>
            <option value="bar">Столбчатый</option>
          </select>
        </div>
      </div>

      {/* График */}
      {cashFlowData.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p>Нет данных для отображения</p>
          <p className="text-sm mt-2">Выберите период или измените фильтры</p>
        </div>
      ) : (
        <div className="mt-6">
          <ResponsiveContainer width="100%" height={400}>
            {chartType === 'line' ? (
              <LineChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => formatAmount(value)}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="income" 
                  stroke={COLORS.CHART_INCOME} 
                  name="Приход"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="expense" 
                  stroke={COLORS.CHART_EXPENSE} 
                  name="Расход"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="balance" 
                  stroke={COLORS.CHART_NET} 
                  name="Баланс"
                  strokeWidth={2}
                />
              </LineChart>
            ) : (
              <BarChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => formatAmount(value)}
                />
                <Legend />
                <Bar dataKey="income" fill={COLORS.CHART_INCOME} name="Приход" />
                <Bar dataKey="expense" fill={COLORS.CHART_EXPENSE} name="Расход" />
                <Bar dataKey="balance" fill={COLORS.CHART_NET} name="Баланс" />
              </BarChart>
            )}
          </ResponsiveContainer>

          {/* Таблица данных */}
          <div className="mt-8 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 text-gray-600">Период</th>
                  <th className="text-right py-3 text-gray-600">Приход</th>
                  <th className="text-right py-3 text-gray-600">Расход</th>
                  <th className="text-right py-3 text-gray-600">Баланс</th>
                </tr>
              </thead>
              <tbody>
                {cashFlowData.map((row: any, index: number) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-3 text-gray-900">{row.period}</td>
                    <td className="py-3 text-right text-green-600">
                      {formatAmount(row.income || 0)}
                    </td>
                    <td className="py-3 text-right text-red-600">
                      {formatAmount(row.expense || 0)}
                    </td>
                    <td className="py-3 text-right text-blue-600">
                      {formatAmount(row.balance || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}