
document.addEventListener('contextmenu', function(e){ e.preventDefault(); });
document.addEventListener('keydown', function(e){
  var k = e.key ? e.key.toLowerCase() : '';
  if(e.key === 'F12'){ e.preventDefault(); return; }
  if((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')){ e.preventDefault(); return; }
  if((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's')){ e.preventDefault(); return; }
});
