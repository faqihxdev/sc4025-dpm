import { useState } from 'react';
import { assetUrl } from '../assets';
import type { Drink } from '../domain/model';
import { Icon } from './Icon';

const loadedThumbnails = new Set<string>();

export function DrinkImage({ drink, large = false, priority = false, transitionName = 'none' }: { drink: Drink; large?: boolean; priority?: boolean; transitionName?: string }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [loadedRendition, setLoadedRendition] = useState<string | null>(null);
  const image = assetUrl(drink.image);
  const small = assetUrl(drink.image.replace('.webp', '-small.webp'));
  const thumbnailUrl = new URL(small, document.baseURI).href;
  const rendition = `${large ? 'detail' : 'thumbnail'}:${image}`;
  const showThumbnail = large && loadedRendition !== rendition && loadedThumbnails.has(thumbnailUrl);
  const shared = { 'data-drink-image': drink.id, style: { viewTransitionName: transitionName } };
  if (failedImage === image) return <span {...shared} className="drink-image image-fallback" role="img" aria-label={`${drink.name}, image unavailable`}><Icon name="cup" size={large ? 80 : 40} /></span>;
  const framing = drink.imageFraming || { scale: 1.55, centerY: 60 };
  const photoStyle = { width: `${framing.scale * 100}%`, height: `${framing.scale * 100}%`, transform: `translate(-50%, -${framing.centerY}%)` };
  return <span className="drink-image" style={shared.style} data-drink-frame={drink.id}>
    {showThumbnail && <img className="drink-image-photo" style={photoStyle} src={small} width="240" height="240" alt="" aria-hidden="true" decoding="async" />}
    <img data-drink-image={drink.id} className="drink-image-photo" style={{ ...photoStyle, opacity: showThumbnail ? 0 : undefined }} src={large ? image : small} srcSet={`${small} 240w, ${image} 560w`} sizes={large ? '440px' : '150px'} width={large ? 560 : 240} height={large ? 560 : 240} alt={drink.name} loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'} onLoad={({ currentTarget }) => {
      if (currentTarget.currentSrc === thumbnailUrl) loadedThumbnails.add(thumbnailUrl);
      if (large) setLoadedRendition(rendition);
    }} onError={() => setFailedImage(image)} />
  </span>;
}
