const logo = 'https://cdn.prod.website-files.com/646b7b525f7ff1456cd5c37b/67646c4c6dad76526557c7ca_white-logo-svg.svg';
const symbol = 'https://cdn.prod.website-files.com/646b7b525f7ff1456cd5c37b/649a5ab8ed4455494bce6c81_cropped-favicon-webclip.png';

/** Official assets from Vertical Bridge's website header/footer, not a recreated wordmark. */
export default function VerticalBridgeBrand({ product }: { product: 'Tower Intelligence' | 'Lease Intelligence' }) {
  return <div className={`vb-brand ${product === 'Lease Intelligence' ? 'vb-brand--lease' : ''}`}>
    <img className="vb-brand__full" src={logo} alt="Vertical Bridge" width={178} height={55} />
    <img className="vb-brand__symbol" src={symbol} alt="" aria-hidden="true" width={34} height={34} />
    <span className="vb-brand__product">{product}</span>
  </div>;
}
