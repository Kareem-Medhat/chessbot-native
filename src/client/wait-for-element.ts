export function waitForElementInParent(parent: Element, selector: string): Promise<HTMLElement> {
  return new Promise((resolve) => {
    const element = parent.querySelector(selector) as HTMLElement;
    if (element) {
      return resolve(element);
    }

    const observer = new MutationObserver(() => {
      const element = parent.querySelector(selector) as HTMLElement;
      if (element) {
        resolve(element);
        observer.disconnect();
      }
    });

    observer.observe(parent, {
      childList: true,
      subtree: true,
    });
  });
}

export function waitForElement(selector: string): Promise<HTMLElement> {
  return waitForElementInParent(document.body, selector);
}
