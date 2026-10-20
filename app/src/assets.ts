import urls from 'virtual:static-assets';

/** Canonical source paths stay readable; production URLs change with file bytes. */
export const assetUrl = (path: string): string => urls[path] ?? path;
