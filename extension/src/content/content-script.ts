import { Readability } from "@mozilla/readability";
import type { ExtractedContent } from "../lib/types";
import { getUserTextSelection, startRegionSelect, stopRegionSelect } from "./region-select";

function extractArticle(): ExtractedContent {
  const url = location.href;
  const selectionText = getUserTextSelection();
  if (selectionText) {
    return { title: document.title, text: selectionText, isSelection: true, url };
  }

  const clone = document.cloneNode(true) as Document;
  const article = new Readability(clone).parse();
  if (article?.textContent) {
    return {
      title: article.title ?? document.title,
      text: article.textContent.trim(),
      isSelection: false,
      url,
    };
  }

  // Fallback for pages Readability can't parse (e.g. very short pages).
  return { title: document.title, text: document.body.innerText.trim(), isSelection: false, url };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "vocalize:extract") {
    sendResponse(extractArticle());
    return true;
  }
  if (message?.type === "vocalize:start-region-select") {
    startRegionSelect((text) => {
      chrome.runtime.sendMessage({ type: "vocalize:region-selected", text, pageUrl: location.href });
    });
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "vocalize:stop-region-select") {
    stopRegionSelect();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
