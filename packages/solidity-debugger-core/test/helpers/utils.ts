
export function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function range(min: number, max: number): number[] {
    var list: number[] = [];
    for (var i = min; i <= max; i++) {
        list.push(i);
    }
    return list
}

export function randomItemFromList<T>(list: T[]): T {
    return list[Math.floor(Math.random()*list.length)];
}

export function randomNumber(low: number, high: number): number {
    return Math.floor(Math.random() * (high - low) + low)
}

export function randomString(n: number): string {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  
    for (var i = 0; i < n; i++)
      text += possible.charAt(Math.floor(Math.random() * possible.length));
  
    return text;
}

export function getRandom<T>(list: T[]): T {
    return list[Math.floor(Math.random()*list.length)];
}
