import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MentionedACModelsPicker, {
  filterACModels,
  formatModelLabel,
} from './MentionedACModelsPicker';
import type { RatingModelListItem } from '@/lib/api/types/rating';

const mockGetModels = vi.fn();
vi.mock('../../services/newsService', () => ({
  default: {
    getACModelsForSelector: () => mockGetModels(),
  },
}));

beforeEach(() => {
  mockGetModels.mockReset();
});

const model = (over: Partial<RatingModelListItem> = {}): RatingModelListItem =>
  ({
    id: 1,
    slug: 'foo',
    brand: 'Foo',
    brand_logo: '',
    inner_unit: '',
    series: '',
    total_index: 0,
    index_max: 100,
    price: null,
    rank: null,
    noise_score: null,
    has_noise_measurement: false,
    publish_status: 'published',
    nominal_capacity: null,
    scores: {},
    is_ad: false,
    ad_position: null,
    region_availability: [],
    ...over,
  }) as RatingModelListItem;

const MODELS: RatingModelListItem[] = [
  model({ id: 1, brand: 'LG', inner_unit: 'LS-07GXFL', series: 'GOLD' }),
  model({ id: 2, brand: 'Daikin', inner_unit: 'FTX20K', series: 'Emura' }),
  model({
    id: 3,
    brand: 'Mitsubishi',
    inner_unit: 'MSZ-LN25',
    series: 'Kirigamine',
  }),
];

describe('formatModelLabel', () => {
  it('формат: Бренд InnerUnit (Series)', () => {
    expect(formatModelLabel(MODELS[0])).toBe('LG LS-07GXFL (GOLD)');
  });
  it('без series: "Бренд InnerUnit"', () => {
    expect(
      formatModelLabel(model({ brand: 'Samsung', inner_unit: 'AR09', series: '' })),
    ).toBe('Samsung AR09');
  });
});

describe('filterACModels', () => {
  it('query < 2 символов → все модели', () => {
    expect(filterACModels(MODELS, 'a')).toHaveLength(3);
    expect(filterACModels(MODELS, '')).toHaveLength(3);
  });
  it('case-insensitive поиск по бренду', () => {
    const r = filterACModels(MODELS, 'DAIKIN');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(2);
  });
  it('поиск по inner_unit', () => {
    const r = filterACModels(MODELS, 'msz-ln');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(3);
  });
  it('поиск по series', () => {
    const r = filterACModels(MODELS, 'emura');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(2);
  });
  it('не находит → пустой массив', () => {
    expect(filterACModels(MODELS, 'unknownxxx')).toHaveLength(0);
  });
});

describe('MentionedACModelsPicker', () => {
  it('при mount грузит модели через newsService', async () => {
    mockGetModels.mockResolvedValue(MODELS);
    render(<MentionedACModelsPicker value={[]} onChange={() => {}} />);
    await waitFor(() => expect(mockGetModels).toHaveBeenCalledTimes(1));
  });

  it('отображает выбранные модели как chips', async () => {
    mockGetModels.mockResolvedValue(MODELS);
    render(<MentionedACModelsPicker value={[1, 3]} onChange={() => {}} />);

    await waitFor(() => {
      const chips = screen.getByTestId('selected-ac-models');
      expect(chips.textContent).toContain('LG LS-07GXFL (GOLD)');
      expect(chips.textContent).toContain('Mitsubishi MSZ-LN25 (Kirigamine)');
    });
  });

  it('клик по X на chip вызывает onChange без удалённого id', async () => {
    mockGetModels.mockResolvedValue(MODELS);
    const onChange = vi.fn();
    render(<MentionedACModelsPicker value={[1, 2]} onChange={onChange} />);

    const removeBtn = await waitFor(() =>
      screen.getByRole('button', { name: /Убрать LG LS-07GXFL/ }),
    );
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith([2]);
  });

  it('ввод в input открывает dropdown с отфильтрованными кандидатами', async () => {
    mockGetModels.mockResolvedValue(MODELS);
    render(<MentionedACModelsPicker value={[]} onChange={() => {}} />);

    const input = await waitFor(() =>
      screen.getByLabelText('Упомянутые AC-модели'),
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'daikin' } });

    const dropdown = await waitFor(() =>
      screen.getByTestId('ac-models-dropdown'),
    );
    expect(dropdown.textContent).toContain('Daikin FTX20K (Emura)');
    expect(dropdown.textContent).not.toContain('LG');
  });

  it('клик по кандидату → onChange содержит добавленный id', async () => {
    mockGetModels.mockResolvedValue(MODELS);
    const onChange = vi.fn();
    render(<MentionedACModelsPicker value={[]} onChange={onChange} />);

    const input = await waitFor(() =>
      screen.getByLabelText('Упомянутые AC-модели'),
    );
    fireEvent.focus(input);

    const option = await waitFor(() =>
      screen.getByRole('option', { name: /Daikin FTX20K/ }),
    );
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith([2]);
  });

  it('при ошибке fetch рисует empty placeholder', async () => {
    mockGetModels.mockRejectedValue(new Error('Network'));
    render(<MentionedACModelsPicker value={[]} onChange={() => {}} />);

    const input = await waitFor(() =>
      screen.getByLabelText('Упомянутые AC-модели'),
    );
    expect((input as HTMLInputElement).placeholder).toMatch(/Не удалось/);
  });
});
