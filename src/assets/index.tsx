import { StaticImageData } from 'next/image';
import noImage from '@/assets/images/no-image.png';

type AssetNames = string;

const assets = (name: AssetNames) => {
  const assetsObject: {
    [key: AssetNames]: StaticImageData;
  } = {};

  return assetsObject?.[name] || noImage;
};

export default assets;
