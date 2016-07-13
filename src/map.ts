export function get<TKey, TValue>(items: [TKey, TValue][], key: TKey): TValue {
	for (let i = 0; i < items.length; i++) {
		if (items[i][0] === key) {
			return items[i][1];
		}
	}
	return;
}

export function set<TKey, TValue>(items: [TKey, TValue][], key: TKey, item: TValue): void {
	for (let i = 0; i < items.length; i++) {
		if (items[i][0] === key) {
			items[i][1] = item;
			return;
		}
	}

	items.push([key, item]);
}

export function remove<TKey, TValue>(items: [TKey, TValue][], key: TKey): void {
	for (let i = 0; i < items.length; i++) {
		if (items[i][0] === key) {
			items.splice(i, 1);
			break;
		}
	}
}
