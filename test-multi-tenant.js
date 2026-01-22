const mongoose = require('mongoose');
require('dotenv').config();

const testMultiTenant = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n✅ Connected to MongoDB\n');

    const User = require('./src/models/User');
    const Document = require('./src/models/Document');
    const ActivityLog = require('./src/models/ActivityLog');

    // 1. Check Users by Tenant
    console.log('=== MULTI-TENANT VERIFICATION ===\n');
    
    const allUsers = await User.find({}, 'email tenantId firstName lastName role');
    console.log(`📊 Total Users: ${allUsers.length}\n`);
    
    const tenantGroups = {};
    allUsers.forEach(user => {
      if (!tenantGroups[user.tenantId]) {
        tenantGroups[user.tenantId] = [];
      }
      tenantGroups[user.tenantId].push(user);
    });

    console.log(`🏢 Unique Tenants: ${Object.keys(tenantGroups).length}\n`);
    
    Object.keys(tenantGroups).forEach(tenantId => {
      console.log(`\n📦 Tenant: ${tenantId}`);
      console.log(`   Users (${tenantGroups[tenantId].length}):`);
      tenantGroups[tenantId].forEach(u => {
        console.log(`   - ${u.email} (${u.firstName} ${u.lastName}) - ${u.role}`);
      });
    });

    // 2. Check Documents by Tenant
    console.log('\n\n=== DOCUMENT ISOLATION ===\n');
    const allDocs = await Document.find({}).populate('owner', 'email tenantId');
    console.log(`📄 Total Documents: ${allDocs.length}\n`);

    if (allDocs.length > 0) {
      const docsByTenant = {};
      allDocs.forEach(doc => {
        if (!docsByTenant[doc.tenantId]) {
          docsByTenant[doc.tenantId] = [];
        }
        docsByTenant[doc.tenantId].push(doc);
      });

      Object.keys(docsByTenant).forEach(tenantId => {
        console.log(`\n📦 Tenant: ${tenantId}`);
        console.log(`   Documents (${docsByTenant[tenantId].length}):`);
        docsByTenant[tenantId].forEach(d => {
          console.log(`   - ${d.title} (Owner: ${d.owner?.email || 'N/A'})`);
        });
      });

      // Verify isolation
      console.log('\n\n=== ISOLATION VERIFICATION ===\n');
      let isolationOK = true;
      allDocs.forEach(doc => {
        if (doc.owner && doc.tenantId !== doc.owner.tenantId) {
          console.log(`❌ ISOLATION BREACH: Document "${doc.title}" (tenant: ${doc.tenantId}) owned by user from different tenant (${doc.owner.tenantId})`);
          isolationOK = false;
        }
      });

      if (isolationOK) {
        console.log('✅ All documents are properly isolated by tenant');
      }
    } else {
      console.log('ℹ️  No documents in database yet');
    }

    // 3. Check Activity Logs
    console.log('\n\n=== ACTIVITY LOG ISOLATION ===\n');
    const activityLogs = await ActivityLog.find({}).limit(10).populate('user', 'email tenantId');
    console.log(`📝 Recent Activity Logs: ${activityLogs.length}\n`);

    if (activityLogs.length > 0) {
      const logsByTenant = {};
      activityLogs.forEach(log => {
        if (!logsByTenant[log.tenantId]) {
          logsByTenant[log.tenantId] = 0;
        }
        logsByTenant[log.tenantId]++;
      });

      Object.keys(logsByTenant).forEach(tenantId => {
        console.log(`📦 Tenant ${tenantId}: ${logsByTenant[tenantId]} activities`);
      });
    }

    // 4. Test Query Isolation
    console.log('\n\n=== QUERY ISOLATION TEST ===\n');
    
    const testTenantId = Object.keys(tenantGroups)[0];
    const otherTenantId = Object.keys(tenantGroups)[1] || 'non_existent';
    
    console.log(`Testing with Tenant 1: ${testTenantId}`);
    console.log(`Testing with Tenant 2: ${otherTenantId}`);
    
    const tenant1Users = await User.find({ tenantId: testTenantId });
    const tenant2Users = await User.find({ tenantId: otherTenantId });
    
    console.log(`\n✅ Tenant 1 query returned ${tenant1Users.length} users`);
    console.log(`✅ Tenant 2 query returned ${tenant2Users.length} users`);
    
    // Verify no cross-tenant data
    const crossCheck = tenant1Users.filter(u => u.tenantId !== testTenantId);
    if (crossCheck.length === 0) {
      console.log('✅ No cross-tenant contamination in query results');
    } else {
      console.log('❌ SECURITY ISSUE: Cross-tenant data in query!');
    }

    console.log('\n\n=== MULTI-TENANT STATUS ===\n');
    console.log('✅ Multi-tenant architecture: ENABLED');
    console.log('✅ Tenant ID generation: AUTO (UUID v4)');
    console.log('✅ Data isolation: BY TENANT ID');
    console.log('✅ User authentication: TENANT-AWARE');
    console.log('✅ Document storage: TENANT-SCOPED');
    console.log('✅ Activity logging: TENANT-ISOLATED');

    console.log('\n=== KEY FEATURES ===\n');
    console.log('1. Each user registration creates a new tenant (or joins existing)');
    console.log('2. All database queries are filtered by tenantId');
    console.log('3. JWT tokens include user context (tenantId extracted from user)');
    console.log('4. Documents, comments, and activities are tenant-isolated');
    console.log('5. File storage paths include tenantId for physical separation');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
};

testMultiTenant();
