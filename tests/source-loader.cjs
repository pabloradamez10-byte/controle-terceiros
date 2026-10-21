const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function inlineEquivalent(html){
 return html.replace(/<script\b[^>]*src="\.\/(assets\/js\/[^"?]+)(?:\?[^"]*)?"[^>]*><\/script>/g,(_,file)=>'<script>'+fs.readFileSync(path.join(root,file),'utf8')+'</script>');
}
module.exports={inlineEquivalent};
